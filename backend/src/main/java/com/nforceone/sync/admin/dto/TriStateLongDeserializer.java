package com.nforceone.sync.admin.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

import java.util.Optional;

/**
 * Deserializes an optional numeric id into a tri-state: property absent -> {@code null},
 * explicit JSON null -> {@code Optional.empty()}, a number -> {@code Optional.of(id)}.
 * Jackson's stock Optional handling returns {@code Optional.empty()} for both absent and null,
 * which is exactly the distinction a PUT that can clear a field needs.
 */
public class TriStateLongDeserializer extends ValueDeserializer<Optional<Long>> {

    @Override
    public Optional<Long> deserialize(JsonParser p, DeserializationContext ctxt) {
        return Optional.of(p.getLongValue());
    }

    @Override
    public Optional<Long> getNullValue(DeserializationContext ctxt) {
        return Optional.empty();
    }

    @Override
    public Object getAbsentValue(DeserializationContext ctxt) {
        return null;
    }
}
