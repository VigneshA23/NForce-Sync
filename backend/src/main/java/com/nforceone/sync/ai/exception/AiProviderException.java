package com.nforceone.sync.ai.exception;

/** Thrown by the Mistral adapters (embedding or completion) on any failure that survives retries. */
public class AiProviderException extends RuntimeException {

    public AiProviderException(String message) {
        super(message);
    }

    public AiProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}
