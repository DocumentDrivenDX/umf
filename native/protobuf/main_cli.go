//go:build !js

package main

import (
	"fmt"
	"io"
	"os"
)

func main() {
	data, err := io.ReadAll(io.LimitReader(os.Stdin, 4_000_001))
	if err != nil {
		panic(err)
	}
	fmt.Println(compile(string(data)))
}
