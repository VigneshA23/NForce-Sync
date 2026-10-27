package com.nforceone.sync.eod;

/**
 * The single id the Blockers API and its links carry for a blocker. A Submit EOD blocker is an eod_task and keeps
 * its task id exactly as before; a Daily Log blocker is an eod_log_line and uses the NEGATIVE of its line id.
 * Task ids and line ids come from different sequences and would otherwise collide, and this keeps every existing
 * route, DTO field, notification link and highlight parameter working unchanged. Storage is not affected — rows
 * reference the real task or line through real foreign keys; this class is the only place that encoding lives.
 */
public final class BlockerKey {
    private BlockerKey() {}

    public static Long ofLine(Long lineId) {
        return -lineId;
    }

    public static Long ofTask(Long taskId) {
        return taskId;
    }

    public static boolean isLine(Long key) {
        return key != null && key < 0;
    }

    /** The eod_task id; only meaningful when {@link #isLine} is false. */
    public static Long taskId(Long key) {
        return key;
    }

    /** The eod_log_line id; only meaningful when {@link #isLine} is true. */
    public static Long lineId(Long key) {
        return -key;
    }
}
