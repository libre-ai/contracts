# Acceptance subject discovery correction plan

Base: immutable reviewed/rejected `3777deef057942ac2fe109fb3fc7865dd0e21bdb`.
Owner selected GET on the existing workspace acceptance path. This is a candidate
authority correction, not a consumer, issuer or persistence implementation.

1. Add failing checks for the missing GET and its closed body/bodyDigest response,
   existing spec-package read authorization, submitted/accepted-only state boundary,
   and discovery-to-existing-signature-to-POST fixture journey.
2. Add the explicit subject response and endpoint metadata. Identity/version come
   from independently reserved ownership, never workspace id/revision conversion.
   Freeze body at submission, reject draft/rejected-review state, and expose current
   revision for If-Match. Require complete canonical body and exact digest.
3. Coordinate the real protocol-operation inventory with the owner repository;
   do not silently weaken the authority mapping gate or mutate locked v1.
4. Run endpoint/schema/refusal and signature-journey tests, then full canonical
   checks. Commit only bounded owned changes and record hashes/evidence externally.

No new role, signing/key/membership service, retained data class or retention period.
The prior detached review and its reject envelope remain immutable.
