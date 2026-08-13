# Cổng đăng ký tuyển sinh (public portal) — design

**Date:** 2026-08-13  
**Status:** Approved for implementation (approach: expand existing `/dang-ky/:orgSlug`)

## Goals

- Anyone can open the public registration portal and submit an application.
- UI/content mirrors the legacy HTML portal (glass card, 3 sections, VN/EN, mobile-first).
- Data is written only into the app (`leads` via `submitPublicLead`), not Google Sheets.
- Applicant selects a counselor/CTV marked for the portal; lead is assigned to that person.
- Training systems from catalog **Hệ đào tạo** (`training_programs`); majors from **Chuyên ngành** (`majors`), filtered by selected system (`departmentId`).

## Data flow

1. `getPublicRegistrationMeta({ orgSlug })` returns: enabled, titles, training programs, majors (with departmentId), portal counselors `{ id, displayName }`, success copy.
2. Student submits → `submitPublicLead` validates, dedupes by phone `uniqueHash`, allocates `systemCode`, writes lead with `registrationChannel: public_portal`, `assignedCounselorId` = selected counselor (must be active + `showOnPublicRegistrationPortal`).
3. Optional n8n webhook unchanged (payload expanded with new student fields).

## Field map (form → lead)

| Form | Lead |
|------|------|
| fullName | fullName (uppercase) |
| dob | dateOfBirth (DD/MM/YYYY) |
| gender | gender |
| pob | placeOfBirth |
| ethnicity | ethnicity |
| cccd / chưa có | nationalId / nationalIdNotAvailable |
| phone | phone |
| email | studentEmail |
| address | permanentAddress + address |
| fatherName/Phone | fatherName / fatherPhone |
| motherName/Phone | motherName / motherPhone; parentPhone = motherPhone \|\| fatherPhone |
| school | highSchool |
| schoolProvince | province |
| situation | applicantCategory |
| eduSystem | educationLevel + studyIntention |
| major | majorInterest |
| score | academicPerformance |
| counselorId | assignedCounselorId |

## Admin

- Staff edit (TVV/CTV): checkbox «Hiện trên cổng đăng ký».
- Catalogs already editable under Cài đặt → Hồ sơ & danh mục (Hệ đào tạo / Chuyên ngành).
- Portal auto-assign by load becomes fallback only when no counselor selected (portal requires selection).

## Out of scope

- Google Apps Script / Sheet sync
- CAPTCHA (future)
