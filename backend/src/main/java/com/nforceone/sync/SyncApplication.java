package com.nforceone.sync;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling drives EodReminderScheduler, the app's only scheduled job. Note there is no
// ShedLock: running more than one replica would run the job on each of them.
@EnableScheduling
@SpringBootApplication
public class SyncApplication {

	public static void main(String[] args) {
		SpringApplication.run(SyncApplication.class, args);
	}

}
