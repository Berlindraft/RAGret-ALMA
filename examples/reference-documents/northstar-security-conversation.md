# Northstar Portal - authentication design conversations

SYNTHETIC HACKATHON CONVERSATION. This scripted discussion uses the team names Raymund Zyron, John Lorenzo, and Jhon Paul. Messages, dates, incidents, test results, commercial plans, and decisions below are fictional; role assignments are for this demonstration only. This is a scripted demonstration, not a real company transcript or a NIST case study. The reference publication is real: NIST SP 800-63B-4, July 2025, https://doi.org/10.6028/NIST.SP.800-63B-4.

Project: Northstar Portal, a fictional customer-support dashboard containing account and service-ticket information. The team voluntarily uses selected NIST authentication guidance as a design reference. This transcript does not establish certification, legal compliance, complete AAL2 conformance, or endorsement by NIST. Product choices that exceed or narrow the guidance are identified as team choices. Scope: v1 pilot on 2026-11-02; v2 planning is separate.

Participants (demo roles only): Raymund Zyron, product direction and release coordination; John Lorenzo, security and privacy review; Jhon Paul, implementation, testing, and user experience.

## Session 1 - 2026-10-12 - Establish the baseline

M01 | 2026-10-12 09:00 | Raymund Zyron: We need an authentication design we can explain to customers and demonstrate without inventing a compliance badge. The pilot exposes support tickets and some account information. Please distinguish what the reference actually says from what we choose for our product. The November 2 pilot is a planning target, not permission to waive unresolved security work.

M02 | 2026-10-12 09:04 | John Lorenzo: I propose Authentication assurance baseline for v1: use AAL2-oriented design requirements as our voluntary reference, because passwords alone do not provide the two factors we want for this portal. This is a proposal for engineering scope, not a declaration that Northstar satisfies every requirement in the full publication.

M03 | 2026-10-12 09:08 | Jhon Paul: Before we commit, I want to separate authentication from identity proofing and authorization. This publication addresses authentication; our account-permission model and enrollment evidence need separate design reviews. A successful second factor must not automatically grant access to every customer's tickets. I will keep those checks in the service layer.

M04 | 2026-10-12 09:12 | Jhon Paul: Our operators share desks but must not share identities. Customers need a clear explanation of why signing in changes. Please avoid saying that a stricter password alone is MFA. Training should explain the factors and the difference between a recovery process and a normal sign-in process, with an accessible route for people who lose a device.

M05 | 2026-10-12 09:18 | Raymund Zyron: I approve Authentication assurance baseline for v1 as an AAL2-oriented engineering target. John Lorenzo will maintain a requirement-to-test checklist, and Jhon Paul will review the evidence before launch. Approval covers this design direction only; we must not advertise NIST certification or complete AAL2 conformance from a reference-document review.

M06 | 2026-10-12 09:24 | John Lorenzo: I want the checklist to include what personal information is collected during authentication, who can read the logs, and how failures are explained to the user. Section 2.4 includes privacy and records-retention considerations. We should not copy every suggested telemetry field into our database without identifying its purpose and retention period.

M07 | 2026-10-12 09:30 | Raymund Zyron: For the pilot, we have one backend engineer and one frontend engineer on authentication. That is a fictional staffing constraint for this scenario, not a statement from NIST. If the scope does not fit, bring a reduced pilot audience or a date change to Raymund Zyron. Do not quietly remove the phishing-resistant option to make the schedule look green.

M08 | 2026-10-12 09:36 | Jhon Paul: I will record each test against a named requirement and attach the result to the relevant decision. A working happy-path sign-in is not enough. We need denied-access cases, lost-session cases, and evidence that the interface does not mislead someone about the assurance of the method they selected.

## Session 2 - 2026-10-13 - Password rules and an initial mistake

M09 | 2026-10-13 10:00 | Jhon Paul: The template login screen has a password meter requiring an uppercase letter, a lowercase letter, a digit, and a symbol. It also disables paste. I have not implemented that template. Can John Lorenzo check the actual password section before we make those interactions part of the product? I would rather remove unsupported requirements before customer testing.

M10 | 2026-10-13 10:05 | John Lorenzo: Section 3.1.1.1 distinguishes single-factor passwords from passwords used only within MFA. The minimums are not interchangeable. Our team can choose a stronger uniform product rule, but we need to call that our decision. The reference also rules out extra character-composition rules and periodic password changes in the absence of compromise evidence.

M11 | 2026-10-13 10:10 | Jhon Paul: I propose Password policy for v1: require at least 15 characters for every password we accept, support at least 64 characters, allow password managers and paste, and remove mandatory mixtures of character types. The uniform 15-character minimum is our product choice, including MFA accounts; we are not claiming NIST requires 15 characters for all MFA passwords.

M12 | 2026-10-13 10:16 | Raymund Zyron: I approve Password policy for v1 with the uniform 15-character minimum, at least 64-character maximum support, password-manager and paste support, and no mandatory character mixtures. Jhon Paul owns server validation and Jhon Paul owns matching interface guidance. We also need compromised-password checks and protections beyond these visible form rules before we call the implementation complete.

M13 | 2026-10-13 10:22 | Jhon Paul: In our fictional customer interviews, two operators said their previous vendor forced a password change every month. They may expect the same here. That expectation is useful to explain, but it does not establish a technical benefit. Please show the policy clearly and avoid promising that a longer password makes phishing impossible.

M14 | 2026-10-13 10:27 | Raymund Zyron: I propose Password rotation for v1: expire every password after 30 days. This is based on the old onboarding checklist, which I have not reconciled with the July 2025 reference. I am raising it explicitly so the team can review the assumption instead of inheriting it invisibly from the previous vendor.

M15 | 2026-10-13 10:31 | Raymund Zyron: I approve Password rotation for v1 with a 30-day expiry as an initial scope decision, pending John Lorenzo's policy review. Record that this approval came from our legacy checklist, not from NIST. If the review contradicts the assumption, bring an explicit replacement decision so the history shows why the policy changed.

M16 | 2026-10-13 10:38 | Jhon Paul: I have flagged the rotation approval for review rather than translating it directly into production tests. The password form tests can proceed, but the rotation behavior is a separate decision. My report will distinguish a proposed test, an implemented check, and a passing result so nobody mistakes planning notes for verification evidence.

## Session 3 - 2026-10-14 - Correct the rotation decision

M17 | 2026-10-14 09:00 | John Lorenzo: I checked original PDF page 25, section 3.1.1.1. It says verifiers must not require periodic password changes, while changes must be forced when there is evidence of compromise. That directly undermines the reason we used for the 30-day expiry. We should correct the decision and the onboarding checklist together.

M18 | 2026-10-14 09:06 | Raymund Zyron: I reverse and explicitly supersede the 2026-10-13 approval of Password rotation for v1. Do not impose scheduled 30-day password changes. Require a change when compromise is evidenced, following the relevant handling process. John Lorenzo owns the checklist correction. The old approval remains in the history as a superseded decision, not as a second active policy.

M19 | 2026-10-14 09:12 | Jhon Paul: I will remove the planned expires-after-30-days field from the authentication task. A credential can still be invalidated for a documented compromise response; that is a different trigger. I will not translate this reversal into a promise that users can never be asked to change a password under any circumstances.

M20 | 2026-10-14 09:18 | Jhon Paul: The interface copy will say we do not require routine scheduled changes, and it will explain a forced reset when the security team identifies compromise evidence. We should not display a countdown that no longer controls anything. I will also remove the inherited composition checklist from the registration mockup so the page matches the approved password policy.

M21 | 2026-10-14 09:24 | John Lorenzo: A compromise event record should have a specific purpose and controlled access. We should not store the user's password in a support ticket to justify the reset. The incident team needs evidence of the event, but sensitive credential content is not an appropriate receipt for this decision-memory system either.

M22 | 2026-10-14 09:30 | Jhon Paul: I will check that an unchanged password is not rejected just because 30 days have passed, and separately test the compromise-triggered invalidation path. These are planned checks, not passing results today. The evidence should let a reviewer see both the original mistaken approval and the later explicit reversal.

M23 | 2026-10-14 09:36 | Jhon Paul: Customer operations can explain that we changed the policy after reviewing the reference. We should not erase Raymund Zyron's earlier proposal from the record or imply he approved the new rule. Raymund Zyron made the replacement decision; John Lorenzo supplied the reference interpretation; operations is preparing the explanation. Those are different roles.

M24 | 2026-10-14 09:42 | Raymund Zyron: Agreed on keeping the history. I will remove the monthly-rotation task from the sprint board and note the replacement decision in its description. This is an implementation follow-up to Raymund Zyron's reversal, not another approval of the old rule. We also need to check any provisioning scripts that might still create an expiry date.

## Session 4 - 2026-10-15 - Choose a phishing-resistant option

M25 | 2026-10-15 11:00 | John Lorenzo: Section 2.2 requires an offered phishing-resistant authentication option at AAL2. A password combined with any arbitrary second step is not automatically phishing-resistant. We should keep this distinction visible in our product language and tests. The publication has other authenticator requirements, so picking a technology name does not finish the assurance review.

M26 | 2026-10-15 11:06 | Jhon Paul: I propose Phishing-resistant sign-in for v1: offer a WebAuthn-based passkey option alongside the permitted fallback path. This depends on Authentication assurance baseline for v1 because that baseline establishes why we must make a phishing-resistant choice available. Device support and enrollment usability still need review; this proposal is not proof of a conforming implementation.

M27 | 2026-10-15 11:12 | Jhon Paul: The fictional pilot customers use a mixture of personal laptops and managed office devices. Some may not recognize the word passkey. Please explain what will happen before showing the browser prompt, and do not claim the same recovery behavior on every device. We need a training example that demonstrates both enrollment and a later sign-in.

M28 | 2026-10-15 11:18 | Jhon Paul: I need to verify challenge handling, the origin and relying-party configuration, replay protection, and binding behavior. A successful browser prompt is only one part of the flow. I will document assumptions and failures so Jhon Paul can test the server behavior independently of Jhon Paul's screen recording. This message does not close the implementation review.

M29 | 2026-10-15 11:24 | Raymund Zyron: I approve Phishing-resistant sign-in for v1: offer the WebAuthn-based passkey option, subject to implementation and test review. Phishing-resistant sign-in for v1 depends on Authentication assurance baseline for v1. Jhon Paul owns the enrollment interface and Jhon Paul owns server integration. Do not label the whole product certified or fully AAL2-conformant on the strength of this approval.

M30 | 2026-10-15 11:30 | Jhon Paul: My test plan will include an expired challenge, a reused challenge, an unexpected origin, an account mismatch, and cancellation of the browser prompt. I also need to see the fallback path explicitly labeled. I am planning this coverage today; a future reviewer should not read these examples as evidence that the tests already passed.

M31 | 2026-10-15 11:36 | John Lorenzo: Review what identifiers and device-related information we retain after enrollment. The design review should state which fields are necessary for authentication and which are optional diagnostics. Our privacy notice should reflect the implementation we actually ship, rather than copying a broad assurance description from a standards document.

M32 | 2026-10-15 11:42 | Raymund Zyron: I will track passkey support as a named delivery item with separate implementation and review tasks. The dependency is the approved assurance baseline, not every other authentication feature in the backlog. We should avoid drawing an impact arrow from passkeys to unrelated policies simply because the same people attended both discussions.

## Session 5 - 2026-10-16 - Reject email OTP as normal sign-in

M33 | 2026-10-16 14:00 | Jhon Paul: I propose Email OTP sign-in for v1: let an operator receive a six-digit email code as the normal second authentication step. It would reduce training effort in this fictional pilot. I have not checked whether that mechanism is acceptable under our chosen reference, and this proposal does not include account recovery or email-address verification.

M34 | 2026-10-16 14:06 | John Lorenzo: Original PDF page 31, section 3.1.3, prohibits email for out-of-band authentication. The same page distinguishes email-address validation codes and recovery codes from that authentication prohibition. We should reject the proposed normal sign-in mechanism without incorrectly claiming every email-delivered code in every workflow is forbidden.

M35 | 2026-10-16 14:12 | Raymund Zyron: I reject Email OTP sign-in for v1 as a normal authentication factor because section 3.1.3 prohibits email for out-of-band authentication. Jhon Paul's usability concern remains valid, but it does not override the selected reference. Recovery codes and email-address verification remain separate design work and are not approved or prohibited by this rejection.

M36 | 2026-10-16 14:18 | Jhon Paul: I will remove the normal sign-in email-code endpoint from the planned API contract. That does not mean deleting notification emails, account-change warnings, or email-address verification. Each of those has its own purpose and security properties. The ticket will link to the specific rejected decision rather than a vague instruction to remove email.

M37 | 2026-10-16 14:24 | Jhon Paul: I will remove the email-code button from the normal authentication screen. The training prototype can still show where support information appears, but it must not accidentally offer a route that the backend rejects. We should test the interface against the approved flow rather than keeping an attractive extra button for the hackathon presentation.

M38 | 2026-10-16 14:30 | Jhon Paul: I will include a negative test for an email code being used as the normal second authentication factor. I will not reuse that test to declare the recovery workflow invalid without reviewing recovery requirements. The demo should show the narrow scope of the rejection and the passage that explains it.

M39 | 2026-10-16 14:36 | Jhon Paul: I understand the distinction. For training, I will explain that validating contact information and authenticating a user are different actions. We can still improve the sign-in instructions and make a support contact visible. I am not treating the rejection of my mechanism as a rejection of the underlying accessibility or usability need.

M40 | 2026-10-16 14:42 | John Lorenzo: The product notes should also avoid saying that email is intrinsically safe for every recovery situation. The passage we reviewed draws a scope distinction; it does not replace a full recovery design. Any future recovery proposal needs its own evidence, risks, and approval rather than inheriting permission from today's conversation.

## Session 6 - 2026-10-19 - Set session boundaries

M41 | 2026-10-19 09:00 | Jhon Paul: The current prototype stays open all day on an unattended desk. That is an observation from our fictional test scenario, not a published NIST finding. I want explicit decisions about overall and inactivity limits so the screen behavior is testable. A warning banner without server-side session handling will not address the underlying issue.

M42 | 2026-10-19 09:06 | John Lorenzo: Section 2.2.3 recommends an AAL2 overall reauthentication timeout of no more than 24 hours and an inactivity timeout of no more than one hour. It points to more detailed session requirements elsewhere in the full document. We may choose stricter product limits, but should not misquote the recommendation as a universal 15-minute requirement.

M43 | 2026-10-19 09:12 | Jhon Paul: I propose Session timeouts for v1: use a 12-hour overall limit and a 30-minute inactivity limit for the portal. Session timeouts for v1 depends on Authentication assurance baseline for v1. These are stricter team-selected limits within our chosen design direction, not exact numbers copied from section 2.2.3. Server-side enforcement and warning behavior need matching tests.

M44 | 2026-10-19 09:18 | Jhon Paul: Operators sometimes read a long ticket without typing. Please warn them before inactivity requires reauthentication, and preserve a permitted draft where the data-handling design allows it. Do not use a screen animation or a background timer request as evidence of real user activity. The distinction needs to be understandable during training.

M45 | 2026-10-19 09:24 | Raymund Zyron: I approve Session timeouts for v1 with a 12-hour overall limit and a 30-minute inactivity limit. Session timeouts for v1 depends on Authentication assurance baseline for v1. Jhon Paul owns server enforcement, Jhon Paul owns the warning interface, and Jhon Paul owns boundary tests. These limits are Northstar product choices, not NIST's exact recommended values.

M46 | 2026-10-19 09:30 | Jhon Paul: I will make the warning keyboard-accessible and explain that reauthentication is required. The interface must not silently imply that clicking the warning extends a server session indefinitely. I will coordinate the countdown display with Jhon Paul's response codes so the demonstration is not running a separate fake session model in the browser.

M47 | 2026-10-19 09:36 | Jhon Paul: I will test just before and after each limit, and check that the backend rejects an expired session even if the browser warning is dismissed. I also need a test for a second tab. These are planned cases; no message in this meeting should be cited as a completed security test report.

M48 | 2026-10-19 09:42 | Raymund Zyron: The implementation ticket must retain both reasons: the reference gives the AAL2-oriented boundary, while our desk-sharing scenario explains the stricter choice. If someone later asks why the inactivity value is 30 minutes, saying only because NIST said so would be inaccurate. Keep the team's rationale alongside the source guidance.

## Session 7 - 2026-10-20 - Defer SMS and discuss recovery

M49 | 2026-10-20 13:00 | Jhon Paul: I propose SMS fallback for v1 for operators who cannot enroll the passkey option on their current devices. This proposal is for a normal authentication fallback, not an emergency bypass. We need to assess the affected users and the reference's restrictions before deciding whether the convenience is worth the additional risk and support work.

M50 | 2026-10-20 13:06 | John Lorenzo: Section 3.1.3.3 calls PSTN-based out-of-band verification restricted, which is different from saying it is universally banned. It brings additional requirements and references further controls. Our selected excerpt introduces that restriction; the full document is available for the complete discussion. We have not finished the review or documented the necessary mitigations for this pilot.

M51 | 2026-10-20 13:12 | Raymund Zyron: I postpone SMS fallback for v1 because the PSTN restriction review and required mitigations are incomplete. This is a Northstar scope decision, not a claim that NIST bans all SMS authentication. John Lorenzo owns the review. We will keep the pilot audience within supported sign-in paths rather than silently enabling an unreviewed fallback to meet the date.

M52 | 2026-10-20 13:18 | Jhon Paul: I will keep the SMS provider integration out of the v1 enabled configuration. A configuration flag in source code is not approval to expose it. If the review produces a new proposal for v2, it must have a separate scope and cannot automatically turn the postponed v1 item into an approved one.

M53 | 2026-10-20 13:24 | Jhon Paul: I can identify the fictional pilot operators who need additional enrollment support. Narrowing the initial audience is a schedule trade-off we can explain. I will not tell customers that they are required to own a particular personal device until the supported-device list and accessibility review are actually complete.

M54 | 2026-10-20 13:30 | John Lorenzo: Phone-number collection would create additional data-handling work if SMS were introduced. We should assess that as part of the later review, not collect numbers now just because a vendor SDK has a phone field. Deferring the mechanism also means checking whether any draft notices or forms mistakenly describe it as already available.

M55 | 2026-10-20 13:36 | Jhon Paul: Recovery is still a separate open design topic. The passage about email recovery codes does not approve our recovery process, and a staff member recognizing a caller is not a documented authenticator. Please avoid adding a support override to make a lost-device demo look smooth. We need a separate proposal before implementation.

M56 | 2026-10-20 13:42 | Raymund Zyron: I will track the SMS review and the recovery proposal as separate backlog tasks. Neither is a hidden dependency of every approved decision. For the demo, the graph should show SMS as postponed and explain the incomplete review; it should not mark all authentication work rejected simply because one fallback is unavailable.

## Session 8 - 2026-10-21 - Launch gate and explicit dependencies

M57 | 2026-10-21 15:00 | Raymund Zyron: I propose Security launch gate for v1: the pilot must wait for the approved phishing-resistant sign-in implementation, the approved password-policy implementation, and server-side session-timeout enforcement to pass their recorded checks. Security launch gate for v1 depends on Phishing-resistant sign-in for v1, Password policy for v1, and Session timeouts for v1. A planned review is not a passed gate.

M58 | 2026-10-21 15:06 | Jhon Paul: I can prepare the verification matrix, but I have not signed it off. A green build and a nice recording are not substitutes for the cases we listed. The graph should reflect approval of the gate as a release rule; it must not infer that the release is approved or that any implementation has already passed.

M59 | 2026-10-21 15:12 | John Lorenzo: The reference is guidance and requirements within its own scope; it is not a record of our meetings. Please keep two evidence paths: Raymund Zyron's message shows who approved a product choice, and a specific NIST passage shows the relevant technical basis. The publication's authors did not attend these fictional meetings or approve Northstar's launch.

M60 | 2026-10-21 15:18 | Raymund Zyron: I approve Security launch gate for v1 as a release rule. Security launch gate for v1 depends on Phishing-resistant sign-in for v1, Password policy for v1, and Session timeouts for v1. Jhon Paul owns verification evidence and Raymund Zyron owns release coordination. Approval of this gate does not approve the launch itself; incomplete checks keep the pilot blocked.

M61 | 2026-10-21 15:24 | Jhon Paul: The demonstration can show a passkey enrollment screen and timeout warning, but I will label the recording as a prototype walkthrough. It must not be uploaded as a real test result or customer event. We should demonstrate how the decision system distinguishes a proposed action, an approved rule, and evidence that work was actually completed.

M62 | 2026-10-21 15:30 | Jhon Paul: I will prepare training that reflects the final positions: email OTP is rejected for normal sign-in, SMS fallback is postponed for v1, and routine 30-day password rotation was explicitly reversed. If someone reads only the first meeting, they will get an outdated answer. That is exactly why the chronological receipts matter in this scenario.

M63 | 2026-10-21 15:36 | John Lorenzo: We should ask the decision system why we selected 30-minute inactivity, why email OTP was rejected, and who superseded the password-rotation approval. Each answer should separate our fictional team's reasoning from the real publication. A question about actual customer breaches should produce no supported incident claim because this corpus contains no real customer incidents.

M64 | 2026-10-21 15:42 | Raymund Zyron: The current record is a plan with explicit approvals and open work, not a completed compliance assessment. Keep the original reference PDF available, label the conversation synthetic, and keep the superseded approval visible. The demo succeeds if a reviewer can follow the evidence and its limits, even when the honest answer is that a check has not yet been performed.
