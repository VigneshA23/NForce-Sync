package com.nforceone.sync.config;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/**
 * CompletableFuture.join() wraps any exception thrown inside the async task in a
 * CompletionException, which would otherwise surface to GlobalExceptionHandler as a different
 * shape than the same failure thrown by a direct (non-parallel) call — this unwraps it back to
 * the original cause so error handling stays identical whether a query ran inline or on
 * dashboardQueryExecutor.
 */
public final class Futures {

    private Futures() {}

    public static <T> T join(CompletableFuture<T> future) {
        try {
            return future.join();
        } catch (CompletionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException re) throw re;
            if (cause instanceof Error err) throw err;
            throw e;
        }
    }
}
