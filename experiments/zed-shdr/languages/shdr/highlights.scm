; Minimal Tree-sitter TypeScript highlights for the Shdr fixture.
; This does not parse shader semantics or replace Zed's full TypeScript queries.
(comment) @comment
(string) @string
(number) @number
(identifier) @variable
(property_identifier) @property
(call_expression function: (identifier) @function)
[
  "import" "from" "export" "default" "const" "return"
] @keyword
["+" "-" "*" "/" "=" "=>"] @operator
