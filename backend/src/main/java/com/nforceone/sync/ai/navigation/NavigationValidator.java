package com.nforceone.sync.ai.navigation;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.NavigationAction;
import com.nforceone.sync.ai.contract.PageReference;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * The only thing allowed to turn a {@code pageId} into a {@link NavigationAction} the client will
 * act on. Two different validations, deliberately different in strictness:
 * <ul>
 *   <li>{@link #validate} — the model's proposed destination. Must be real, non-placeholder, and
 *       reachable by the caller's role, or it is dropped entirely (empty).</li>
 *   <li>{@link #validateCurrentPage} — the client-supplied "what page am I looking at" hint.
 *       Placeholders are allowed here, since it is only ever used as retrieval/prompt context
 *       ("the user is currently viewing X"), never as a navigation target.</li>
 * </ul>
 */
@Component
public class NavigationValidator {

    private final PageRegistry pageRegistry;

    public NavigationValidator(PageRegistry pageRegistry) {
        this.pageRegistry = pageRegistry;
    }

    public Optional<NavigationAction> validate(String pageId, AssistantRequestContext context) {
        if (pageId == null || pageId.isBlank() || context == null || context.role() == null) {
            return Optional.empty();
        }
        return pageRegistry.find(pageId, context.role())
                .filter(ref -> !ref.placeholder())
                .map(ref -> new NavigationAction(ref.pageId(), ref.label()));
    }

    public Optional<PageReference> validateCurrentPage(String pageId, AssistantRequestContext context) {
        if (pageId == null || pageId.isBlank() || context == null || context.role() == null) {
            return Optional.empty();
        }
        return pageRegistry.find(pageId, context.role());
    }
}
