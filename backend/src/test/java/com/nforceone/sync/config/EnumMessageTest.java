package com.nforceone.sync.config;

import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.eod.dto.SaveEodTaskRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.HttpMessageNotReadableException;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * An unknown value for an enum field names the field and lists what is accepted — for Submit EOD's task status and
 * the Daily Log's line status alike — instead of the old blanket "Invalid role" every enum used to get.
 */
class EnumMessageTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    private String messageFor(String json, Class<?> type) {
        try {
            mapper.readValue(json, type);
            throw new AssertionError("expected the body to be unreadable");
        } catch (tools.jackson.core.JacksonException e) {
            return GlobalExceptionHandler.unreadableBodyMessage(new HttpMessageNotReadableException("bad", e, null));
        }
    }

    @Test
    void anUnknownDailyLogLineStatusSaysWhatIsAccepted() {
        assertEquals("Invalid status. Use Completed, In Progress, Blocked or Not Started.",
                messageFor("{\"categoryId\":5,\"hours\":1,\"taskStatus\":\"DONE\"}", SaveEodLogLineRequest.class));
    }

    @Test
    void theSameForSubmitEodsTask_soItIsFixedThereToo() {
        assertEquals("Invalid status. Use Completed, In Progress, Blocked or Not Started.",
                messageFor("{\"taskStatus\":\"DONE\"}", SaveEodTaskRequest.class));
    }

    @Test
    void aNestedLineInsideTheSaveRequestIsFoundToo() {
        assertEquals("Invalid status. Use Completed, In Progress, Blocked or Not Started.",
                messageFor("{\"entryDate\":\"2026-10-09\",\"logLines\":[{\"categoryId\":5,\"hours\":1,\"taskStatus\":\"nope\"}]}",
                        SaveEodRequest.class));
    }

    @Test
    void otherEnumsNameTheirOwnField_insteadOfBeingCalledARole() {
        assertEquals("Invalid day type. Use Working Day, First Half Leave, Second Half Leave, Leave, Holiday or Weekend.",
                messageFor("{\"entryDate\":\"2026-10-09\",\"dayType\":\"SICK\"}", SaveEodRequest.class));
        assertEquals("Invalid role. Use Employee, PM, Admin or Superadmin.",
                messageFor("{\"role\":\"BOSS\"}", UpdateUserRequest.class));
    }

    @Test
    void aBodyThatIsNotAnEnumProblemStaysInvalidRequestBody() {
        assertEquals("Invalid request body", GlobalExceptionHandler.unreadableBodyMessage(
                new HttpMessageNotReadableException("bad", new RuntimeException("not json"), null)));
    }
}
