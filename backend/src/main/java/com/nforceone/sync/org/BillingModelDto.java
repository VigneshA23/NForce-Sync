package com.nforceone.sync.org;

/**
 * @param employeeCount distinct employees currently allocated to a project on this billing model.
 *                      Passed in rather than derived, so the list endpoint can resolve every count
 *                      in one grouped query instead of one per row.
 */
public record BillingModelDto(Long id, String name, boolean active, long employeeCount) {
    public static BillingModelDto from(BillingModel b, long employeeCount) {
        return new BillingModelDto(b.getId(), b.getName(), b.isActive(), employeeCount);
    }
}
