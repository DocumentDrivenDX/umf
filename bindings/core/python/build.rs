fn main() {
    pyo3_build_config::use_pyo3_cfgs();
    // Python extension symbols are resolved by the host interpreter. On macOS,
    // explicitly opt into dynamic lookup so the abi3 module links as a wheel.
    pyo3_build_config::add_extension_module_link_args();
}
