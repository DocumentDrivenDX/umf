from umf import read_document, validate_document, write_document

document = read_document('''
umf: "0.10.0"
id: orders
vocabularies: {}
modules: []
''', format="yaml")
result = validate_document(document)
assert result.valid
# An empty semantic registry does not establish complete interpretation.
assert not result.complete
text = write_document(document, format="yaml")
assert read_document(text, format="yaml").to_dict() == document.to_dict()
