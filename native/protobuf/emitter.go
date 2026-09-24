package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoprint"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
)

func normalized(file *descriptorpb.FileDescriptorProto) *descriptorpb.FileDescriptorProto {
	data, err := proto.MarshalOptions{Deterministic: true}.Marshal(file)
	if err != nil {
		panic(err)
	}
	result := &descriptorpb.FileDescriptorProto{}
	if err = (proto.UnmarshalOptions{Resolver: new(protoregistry.Types)}).Unmarshal(data, result); err != nil {
		panic(err)
	}
	result.SourceCodeInfo = nil
	if result.GetSyntax() == "" {
		result.Syntax = proto.String("proto2")
	}
	return result
}

func emit(req request) response {
	result := response{Compiler: "protocompile 0.14.1", Printer: "protoprint 1.18.1"}
	fail := func(err error) response { result.Error = err.Error(); result.Files = nil; return result }
	data, err := hex.DecodeString(req.DescriptorHex)
	if err != nil {
		return fail(err)
	}
	original := &descriptorpb.FileDescriptorSet{}
	if err = proto.Unmarshal(data, original); err != nil {
		return fail(err)
	}
	if len(original.File) == 0 {
		return fail(fmt.Errorf("No files to emit"))
	}
	// An opaque FileDescriptorSet extension has no source-level destination.
	if len(original.ProtoReflect().GetUnknown()) > 0 {
		return fail(fmt.Errorf("Unknown descriptor-set fields cannot be emitted as source"))
	}
	files, err := desc.CreateFileDescriptorsFromSet(proto.Clone(original).(*descriptorpb.FileDescriptorSet))
	if err != nil {
		return fail(err)
	}
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	result.Files = map[string]string{}
	printer := &protoprint.Printer{}
	for _, name := range names {
		text, err := printer.PrintProtoToString(files[name])
		if err != nil {
			return fail(err)
		}
		result.Files[name] = text
	}
	// Recompile all emitted files. Reject every descriptor mismatch except source
	// locations/comments and the native omitted-vs-explicit proto2 syntax spelling.
	input, _ := json.Marshal(request{Files: result.Files, Roots: names})
	var compiled response
	if err = json.Unmarshal([]byte(compile(string(input))), &compiled); err != nil {
		return fail(err)
	}
	if compiled.Error != "" {
		return fail(fmt.Errorf("Emitted source does not compile: %s", compiled.Error))
	}
	data, err = hex.DecodeString(compiled.DescriptorHex)
	if err != nil {
		return fail(err)
	}
	rebuilt := &descriptorpb.FileDescriptorSet{}
	if err = proto.Unmarshal(data, rebuilt); err != nil {
		return fail(err)
	}
	byName := map[string]*descriptorpb.FileDescriptorProto{}
	for _, file := range rebuilt.File {
		byName[file.GetName()] = file
	}
	if len(original.File) != len(byName) {
		return fail(fmt.Errorf("Emitted source changed descriptor file set"))
	}
	for _, file := range original.File {
		other := byName[file.GetName()]
		if other == nil || !proto.Equal(normalized(file), normalized(other)) {
			return fail(fmt.Errorf("Emitted source changed descriptor semantics: %s", file.GetName()))
		}
	}
	return result
}
