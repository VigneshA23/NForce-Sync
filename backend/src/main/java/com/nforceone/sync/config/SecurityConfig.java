package com.nforceone.sync.config;

import com.nforceone.sync.auth.JwtFilter;
import com.nforceone.sync.auth.JwtService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    // JwtFilter injected via filterChain method param — NOT via constructor — so
    // SecurityConfig does not need @Lazy and there is no circular dependency.
    @Bean
    public JwtFilter jwtFilter(JwtService jwtService) {
        return new JwtFilter(jwtService);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtFilter jwtFilter) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Path-only matchers (no HttpMethod arg) — Spring Security 7's
                // MvcRequestMatcher with an HttpMethod constraint does not correctly
                // whitelist the path in Boot 4.x; removing the method constraint fixes it.
                .requestMatchers("/api/auth/login", "/api/auth/forgot-password").permitAll()
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, authEx) -> {
                    res.setContentType("application/json");
                    res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    res.getWriter().write("{\"error\":\"Unauthorized\"}");
                })
                .accessDeniedHandler((req, res, accessDeniedException) -> {
                    res.setContentType("application/json");
                    res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    res.getWriter().write("{\"error\":\"Forbidden\"}");
                })
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    // UserDetailsService injected via method param — avoids the circular dependency
    // that would arise from constructor-injecting it here.
    @Bean
    public AuthenticationManager authenticationManager(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {
        // Spring Security 7 (Boot 4): UserDetailsService is a required constructor arg.
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }
}
