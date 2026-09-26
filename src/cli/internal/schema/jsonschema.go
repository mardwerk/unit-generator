package schema

// JSONSchema renders a schema the way z.toJSONSchema(schema, {reused: 'inline'})
// does, as ordered values ready to send to a provider.
func JSONSchema(s Schema) *Object {
	out := NewObject().Set("$schema", "https://json-schema.org/draft/2020-12/schema")
	node := s.jsonSchema()
	for _, key := range node.keys {
		out.Set(key, node.values[key])
	}
	return out
}

func (s *StringSchema) jsonSchema() *Object {
	out := NewObject().Set("type", "string")
	minimum, maximum := -1, -1
	for _, check := range s.lengths {
		switch check.kind {
		case "min":
			if check.n > minimum {
				minimum = check.n
			}
		case "max":
			if maximum < 0 || check.n < maximum {
				maximum = check.n
			}
		}
	}
	if minimum >= 0 {
		out.Set("minLength", float64(minimum))
	}
	if maximum >= 0 {
		out.Set("maxLength", float64(maximum))
	}
	if s.url {
		out.Set("format", "uri")
	}
	for _, p := range s.regexes {
		out.Set("pattern", p.source)
	}
	return out
}

func (s *NumberSchema) jsonSchema() *Object {
	out := NewObject()
	if s.integer {
		out.Set("type", "integer")
	} else {
		out.Set("type", "number")
	}
	var lower, upper string
	var lowerValue, upperValue float64
	for _, check := range s.checks {
		switch check.op {
		case "gt":
			if lower == "" || check.limit >= lowerValue {
				lower, lowerValue = "exclusiveMinimum", check.limit
			}
		case "gte":
			if lower == "" || check.limit > lowerValue {
				lower, lowerValue = "minimum", check.limit
			}
		case "lt":
			if upper == "" || check.limit <= upperValue {
				upper, upperValue = "exclusiveMaximum", check.limit
			}
		case "lte":
			if upper == "" || check.limit < upperValue {
				upper, upperValue = "maximum", check.limit
			}
		}
	}
	if s.integer {
		if lower == "" {
			lower, lowerValue = "minimum", -maxSafeInteger
		}
		if upper == "" {
			upper, upperValue = "maximum", maxSafeInteger
		}
	}
	if lower != "" {
		out.Set(lower, lowerValue)
	}
	if upper != "" {
		out.Set(upper, upperValue)
	}
	return out
}

func (boolSchema) jsonSchema() *Object    { return NewObject().Set("type", "boolean") }
func (nullSchema) jsonSchema() *Object    { return NewObject().Set("type", "null") }
func (unknownSchema) jsonSchema() *Object { return NewObject() }

func (s *LiteralSchema) jsonSchema() *Object {
	if _, ok := s.value.(float64); ok {
		return NewObject().Set("type", "number").Set("const", s.value)
	}
	return NewObject().Set("type", "string").Set("const", s.value)
}

func (s *EnumSchema) jsonSchema() *Object {
	values := make([]any, len(s.Values))
	for i, v := range s.Values {
		values[i] = v
	}
	return NewObject().Set("type", "string").Set("enum", values)
}

func (s nullableSchema) jsonSchema() *Object {
	inner := s.inner.jsonSchema()
	if inner.Len() == 1 {
		if t, ok := inner.values["type"].(string); ok {
			return NewObject().Set("type", []any{t, "null"})
		}
	}
	return NewObject().Set("anyOf", []any{inner, NewObject().Set("type", "null")})
}

func (s optionalSchema) jsonSchema() *Object { return s.inner.jsonSchema() }
func (s *refined) jsonSchema() *Object       { return s.inner.jsonSchema() }

func (s *ArraySchema) jsonSchema() *Object {
	out := NewObject()
	for _, check := range s.lengths {
		switch check.kind {
		case "min":
			out.Set("minItems", float64(check.n))
		case "max":
			out.Set("maxItems", float64(check.n))
		case "exact":
			out.Set("minItems", float64(check.n))
			out.Set("maxItems", float64(check.n))
		}
	}
	out.Set("type", "array")
	out.Set("items", s.Element.jsonSchema())
	return out
}

func (s tupleSchema) jsonSchema() *Object {
	items := make([]any, len(s.items))
	for i, item := range s.items {
		items[i] = item.jsonSchema()
	}
	return NewObject().Set("type", "array").Set("prefixItems", items).Set("items", false).
		Set("minItems", float64(len(s.items))).Set("maxItems", float64(len(s.items)))
}

func (s *ObjectSchema) jsonSchema() *Object {
	properties := NewObject()
	required := []any{}
	for _, f := range s.Fields {
		properties.Set(f.Name, f.Schema.jsonSchema())
		if !isOptional(f.Schema) {
			required = append(required, f.Name)
		}
	}
	out := NewObject().Set("type", "object").Set("properties", properties)
	if len(required) > 0 {
		out.Set("required", required)
	}
	out.Set("additionalProperties", false)
	return out
}

func (s recordSchema) jsonSchema() *Object {
	return NewObject().Set("type", "object").Set("propertyNames", NewObject().Set("type", "string")).
		Set("additionalProperties", s.value.jsonSchema())
}

func (s discriminatedSchema) jsonSchema() *Object {
	options := make([]any, len(s.options))
	for i, option := range s.options {
		options[i] = option.jsonSchema()
	}
	return NewObject().Set("oneOf", options)
}

func (s unionSchema) jsonSchema() *Object {
	options := make([]any, len(s.options))
	types := []any{}
	simple := true
	for i, option := range s.options {
		node := option.jsonSchema()
		options[i] = node
		t, ok := node.values["type"].(string)
		if node.Len() != 1 || !ok {
			simple = false
		} else {
			types = append(types, t)
		}
	}
	if simple {
		return NewObject().Set("type", types)
	}
	return NewObject().Set("anyOf", options)
}
