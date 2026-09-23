package com.nforceone.sync.config;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Bounded thread pool for fanning a dashboard endpoint's independent read queries out in
 * parallel instead of running them one at a time on the request thread.
 *
 * <p>Each query against the remote Neon DB costs ~0.3-1.5s in network round trip alone (measured
 * directly — this is not local computation time), and a single dashboard load legitimately needs
 * 8-15 independent reads (holidays, allocations, snapshots, entries, config, …). Run sequentially
 * that's sum(latencies) — 5-15+ seconds. Run in parallel it's max(latency) — close to the cost of
 * one query. See EmployeeService/TeamLeadService for the call sites.
 *
 * <p>Sized well within HikariCP's maximum-pool-size (see application.yml) so a burst of parallel
 * dashboard branches from a few concurrent users can't starve the connection pool itself.
 */
@Configuration
public class AsyncQueryConfig {

    @Bean
    public Executor dashboardQueryExecutor() {
        return Executors.newFixedThreadPool(12);
    }
}
