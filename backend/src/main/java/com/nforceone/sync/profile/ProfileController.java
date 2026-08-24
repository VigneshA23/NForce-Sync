package com.nforceone.sync.profile;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocationRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Base64;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final AppUserRepository      userRepository;
    private final DepartmentRepository   departmentRepository;
    private final DesignationRepository  designationRepository;
    private final OrgLocationRepository  locationRepository;

    public ProfileController(AppUserRepository userRepository,
                             DepartmentRepository departmentRepository,
                             DesignationRepository designationRepository,
                             OrgLocationRepository locationRepository) {
        this.userRepository       = userRepository;
        this.departmentRepository = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository   = locationRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ProfileDto getProfile() {
        return buildDto(requireCurrentUser());
    }

    @PatchMapping
    @Transactional
    public ProfileDto updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        AppUser user = requireCurrentUser();
        if (request.phone() != null)                 user.setPhone(request.phone());
        if (request.emergencyContactName() != null)  user.setEmergencyContactName(request.emergencyContactName());
        if (request.emergencyContactPhone() != null) user.setEmergencyContactPhone(request.emergencyContactPhone());
        if (request.workMode() != null)              user.setWorkMode(request.workMode());
        if (request.personalEmail() != null)         user.setPersonalEmail(request.personalEmail());
        if (request.gender() != null)                user.setGender(request.gender());
        if (request.address() != null)               user.setAddress(request.address());
        if (request.dateOfBirth() != null && !request.dateOfBirth().isBlank()) {
            try {
                user.setDateOfBirth(LocalDate.parse(request.dateOfBirth()));
            } catch (Exception ignored) {}
        }
        userRepository.save(user);
        return buildDto(user);
    }

    @PostMapping("/photo")
    @Transactional
    public ProfileDto uploadPhoto(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        long maxSize = 2L * 1024 * 1024; // 2 MB limit
        if (file.getSize() > maxSize) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image must be smaller than 2 MB");
        }
        AppUser user = requireCurrentUser();
        String mediaType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        String dataUrl = "data:" + mediaType + ";base64," + Base64.getEncoder().encodeToString(file.getBytes());
        user.setPhotoData(dataUrl);
        userRepository.save(user);
        return buildDto(user);
    }

    /** Clears the photo, returning the caller to their initials avatar. Idempotent. */
    @DeleteMapping("/photo")
    @Transactional
    public ProfileDto deletePhoto() {
        AppUser user = requireCurrentUser();
        user.setPhotoData(null);
        userRepository.save(user);
        return buildDto(user);
    }

    private AppUser requireCurrentUser() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private ProfileDto buildDto(AppUser user) {
        String managerName    = user.getManager() != null ? user.getManager().getFullName() : null;
        String departmentName = user.getDepartmentId() != null
                ? departmentRepository.findById(user.getDepartmentId()).map(d -> d.getName()).orElse(null) : null;
        String designationName = user.getDesignationId() != null
                ? designationRepository.findById(user.getDesignationId()).map(d -> d.getTitle()).orElse(null) : null;
        String locationName   = user.getLocationId() != null
                ? locationRepository.findById(user.getLocationId()).map(l -> l.getName()).orElse(null) : null;
        return ProfileDto.from(user, managerName, departmentName, designationName, locationName);
    }
}
