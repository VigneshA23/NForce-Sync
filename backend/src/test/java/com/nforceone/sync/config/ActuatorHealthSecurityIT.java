package com.nforceone.sync.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Public health probe: GET /actuator/health works with no JWT and returns only the status, while
 * the rest of the API (and every other actuator path) stays protected.
 *
 * <p>Boots the full context so the real database health indicator runs — needs the live DB, so it
 * is skipped unless NFORCE_LIVE_DB_IT=true like the other integration tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named = "NFORCE_LIVE_DB_IT", matches = "true")
class ActuatorHealthSecurityIT {

    @Autowired MockMvc mvc;

    @Test
    void healthIsPublicAndReturnsOnlyStatus() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", true)); // strict: no components/details
    }

    @Test
    void healthIgnoresAnInvalidBearerToken() throws Exception {
        mvc.perform(get("/actuator/health").header("Authorization", "Bearer not-a-real-token"))
                .andExpect(status().isOk());
    }

    @Test
    void otherEndpointsStillRequireAuth() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"Unauthorized\"}"));
    }

    @Test
    void otherActuatorEndpointsAreNotPublic() throws Exception {
        // Not exposed (include=health) and not permitted — must never answer 200 anonymously.
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/beans")).andExpect(status().isUnauthorized());
    }
}
