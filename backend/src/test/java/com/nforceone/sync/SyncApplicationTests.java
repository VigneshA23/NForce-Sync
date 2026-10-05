package com.nforceone.sync;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "NFORCE_LIVE_DB_IT", matches = "true")
class SyncApplicationTests {

	@Test
	void contextLoads() {
	}

}
