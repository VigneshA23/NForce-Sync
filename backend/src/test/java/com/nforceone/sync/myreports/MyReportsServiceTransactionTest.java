package com.nforceone.sync.myreports;

import com.nforceone.sync.teamlead.dto.BlockerStatusRequest;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionAttribute;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * MyReportsService is read-only by default. A write that delegates to another service joins the caller's transaction,
 * so if the method itself is left read-only the callee's own read-write setting is ignored, Hibernate never flushes,
 * and the change is silently dropped while the request still returns 200. That is how Resolved / Needs Response on the
 * Reporting Manager's Blockers page did nothing. Every method here that writes must say so.
 *
 * Asks Spring for the effective attribute of each method (method-level beats class-level), exactly as the proxy does.
 */
class MyReportsServiceTransactionTest {

    private static final AnnotationTransactionAttributeSource ATTRIBUTES = new AnnotationTransactionAttributeSource();

    private static TransactionAttribute attributeOf(String name, Class<?>... params) throws NoSuchMethodException {
        Method method = MyReportsService.class.getMethod(name, params);
        TransactionAttribute attribute = ATTRIBUTES.getTransactionAttribute(method, MyReportsService.class);
        assertNotNull(attribute, name + " must run in a transaction");
        return attribute;
    }

    @Test
    void acknowledgeBlocker_writes_soItMustNotBeReadOnly() throws Exception {
        assertFalse(attributeOf("acknowledgeBlocker", Long.class, String.class).isReadOnly(),
                "acknowledgeBlocker writes; a read-only transaction silently discards the acknowledgement");
    }

    @Test
    void setBlockerStatus_writes_soItMustNotBeReadOnly() throws Exception {
        assertFalse(attributeOf("setBlockerStatus", Long.class, String.class, BlockerStatusRequest.class).isReadOnly(),
                "setBlockerStatus writes; a read-only transaction silently discards Needs Response / Acknowledged / Resolved");
    }

    @Test
    void approveAndReject_stayReadWrite() throws Exception {
        assertFalse(attributeOf("approve", Long.class, String.class, String.class).isReadOnly());
        assertFalse(attributeOf("reject", Long.class, String.class, String.class).isReadOnly());
    }

    @Test
    void theReads_stayReadOnly() throws Exception {
        assertTrue(attributeOf("getBlocker", Long.class, String.class).isReadOnly());
        assertEquals(true, attributeOf("getEodInbox", boolean.class, String.class).isReadOnly());
    }
}
