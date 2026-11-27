package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"github.com/bufbuild/protocompile"
	"github.com/bufbuild/protocompile/reporter"
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
		// protocompile compiles each file in its own goroutine, so the first error it
		// reports depends on scheduling when several files are invalid. Collect every
		// error and report the earliest by file and position, so the same sources
		// always produce the same message.
		var mutex sync.Mutex
		var reported []reporter.ErrorWithPos
		collect := reporter.NewReporter(func(err reporter.ErrorWithPos) error {
			mutex.Lock()
			defer mutex.Unlock()
			reported = append(reported, err)
			return nil
		}, nil)
		compiler := protocompile.Compiler{Resolver: &protocompile.SourceResolver{Accessor: protocompile.SourceAccessorFromMap(req.Files)}, SourceInfoMode: protocompile.SourceInfoStandard, MaxParallelism: 1, Reporter: collect}
		files, err := compiler.Compile(context.Background(), req.Roots...)
		if len(reported) > 0 {
			sort.SliceStable(reported, func(i, j int) bool {
				a, b := reported[i].GetPosition(), reported[j].GetPosition()
				if a.Filename != b.Filename {
					return a.Filename < b.Filename
				}
				return a.Offset < b.Offset
			})
			result.Error = reported[0].Error()
		} else if err != nil {
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
