fn main() {
    // PyO3 intentionally leaves interpreter symbols unresolved for extension modules.
    // macOS additionally requires the dynamic-lookup linker mode.
    pyo3_build_config::add_extension_module_link_args();
}
