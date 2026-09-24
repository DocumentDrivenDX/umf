package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/bufbuild/protocompile"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
)

type request struct {
	Operation     string            `json:"operation,omitempty"`
	DescriptorHex string            `json:"descriptorHex,omitempty"`
	Files         map[string]string `json:"files"`
	Roots         []string          `json:"roots"`
}
type response struct {
	Compiler      string            `json:"compiler"`
	DescriptorHex string            `json:"descriptorHex,omitempty"`
	Error         string            `json:"error,omitempty"`
	Files         map[string]string `json:"files,omitempty"`
	Printer       string            `json:"printer,omitempty"`
}

func compile(input string) (output string) {
	result := response{Compiler: "protocompile 0.14.1"}
	defer func() {
		if value := recover(); value != nil {
			result.Error = fmt.Sprint(value)
			data, _ := json.Marshal(result)
			output = string(data)
		}
	}()
	var req request
	if len(input) > 4_000_000 {
		result.Error = "Source request exceeds limit"
	} else if err := json.Unmarshal([]byte(input), &req); err != nil {
		result.Error = err.Error()
	} else if req.Operation == "emit" {
		result = emit(req)
	} else if req.Operation != "" && req.Operation != "compile" {
		result.Error = "Unknown operation"
	} else if len(req.Roots) == 0 {
		result.Error = "At least one root is required"
	} else {
		compiler := protocompile.Compiler{Resolver: &protocompile.SourceResolver{Accessor: protocompile.SourceAccessorFromMap(req.Files)}, SourceInfoMode: protocompile.SourceInfoStandard, MaxParallelism: 1}
		files, err := compiler.Compile(context.Background(), req.Roots...)
		if err != nil {
			result.Error = err.Error()
		} else {
			set := &descriptorpb.FileDescriptorSet{}
			seen := map[string]bool{}
			var visit func(protoreflect.FileDescriptor)
			visit = func(file protoreflect.FileDescriptor) {
				if seen[file.Path()] {
					return
				}
				seen[file.Path()] = true
				for i := 0; i < file.Imports().Len(); i++ {
					visit(file.Imports().Get(i).FileDescriptor)
				}
				set.File = append(set.File, protodesc.ToFileDescriptorProto(file))
			}
			for _, file := range files {
				visit(file)
			}
			data, err := proto.Marshal(set)
			if err != nil {
				result.Error = err.Error()
			} else {
				result.DescriptorHex = hex.EncodeToString(data)
			}
		}
	}
	data, _ := json.Marshal(result)
	return string(data)
}
