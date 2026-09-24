//go:build js && wasm

package main

import "syscall/js"

func main() {
	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 {
			return `{"error":"Expected source request"}`
		}
		return compile(args[0].String())
	})
	js.Global().Set("umfCompileProtobuf", callback)
	select {}
}
