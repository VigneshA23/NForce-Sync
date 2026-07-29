package com.nforceone.sync.auth;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public UserDetailsServiceImpl(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        // Throw the same exception for inactive users — DaoAuthenticationProvider
        // converts UsernameNotFoundException → BadCredentialsException so callers
        // can never distinguish "not found" from "inactive" from "wrong password".
        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw new UsernameNotFoundException("User not found");
        }
        return new AppUserDetails(user);
    }
}
