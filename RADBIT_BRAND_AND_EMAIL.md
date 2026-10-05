# Radbit product name and email launch

Selected by the user: **Radbit Auto** at **auto.radbitstudios.co.zw**. Descriptor: “Stock. Sales. Imports.” Auto covers the buyer marketplace, owned/consigned stock, customer imports, dealer acquisitions and clearing workflows. “CarDealer” is descriptive but positions the product narrowly around dealerships; “Radbit Dealer” at dealer.radbitstudios.co.zw is an alternative if dealer operations should dominate the brand. These are recommendations, not trademark clearance or a claim that a subdomain is already live. The main Radbit site already presents Radbit Ops as a sibling product: https://radbitstudios.co.zw/.

Name selection is approved. Public branding, authentication/setup titles, browser/PWA name, icons, install previews and studio attribution have been updated. Firebase Hosting now has the approved custom-domain resource, and Firebase Authentication authorises the approved hostname while preserving previous domains. Both exact DNS records were explicitly approved by the user and saved in Cloudflare. Authoritative queries to blair.ns.cloudflare.com confirm the CNAME target and certificate TXT value, both with TTL 300. The existing Firebase URL remains live while Firebase validates the custom domain and certificate.

## Concrete cutover work after selection

- Change the public wordmark, login/setup name, page title, PWA name/description and support copy consistently. Keep agency branding in its own workspace.
- Add the selected custom domain to the existing Firebase Hosting site, retrieve its provider-generated ownership/hosting DNS records, and publish those exact records at the authoritative DNS provider. Wait for ownership, hosting and TLS validation; retain the existing Firebase URL during the transition.
- Add the custom hostname to Firebase Authentication authorised domains. Check Google popup/redirect authentication and email continuation from both hosts. Existing browser authentication state is per origin: users may need to sign in again on the custom domain.
- Email sender-domain authentication is separate from website DNS/TLS. Configure and verify the chosen branded sender domain using Firebase's custom-email-domain flow or an approved transactional SMTP provider. Apply the exact generated authentication records; do not invent SPF/DKIM values or overwrite existing mail records.
- Test with an authorised recipient mailbox, including the actual verification link, resend behavior, return to owner setup and invitation continuation. Sender authentication improves trust but does not guarantee inbox placement.

## Verification incident and changes

The user confirmed the missing verification email was found in Spam. Production Authentication has email sign-in enabled, default Firebase sending, the live Firebase hostname authorised, and its default hosted action handler. No Authentication errors were returned by the bounded seven-day error-log query; this is not a delivery receipt. A narrowly scoped search of the connected mailbox for the project sender returned no matches; it did not establish which account received the user's signup email.

Sender display name is now **Radbit Studios** and reply-to is **brandontinoz@gmail.com**, confirmed by production configuration readback. Firebase rejected the attempted custom verification subject with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED; the mandatory default subject/body and existing delivery settings were preserved. No custom sender domain/SMTP has been configured, and future inbox delivery is not guaranteed.

The application now requests verification automatically on entering agency setup or an unverified pending invitation, after reloading account state. It preserves the correct setup/invitation continuation URL, avoids duplicate in-flight sends, applies a 60-second browser resend cooldown, and reports request failures/throttling without claiming inbox delivery. Returning to the tab rechecks account verification and refreshes the server token; a manual check remains available. Users can safely sign out to choose Google or another account, with the original journey retained. Server-side verified-email requirements remain in place.

Validation: all seven owner signup, email-verification and staff/customer invitation browser journeys passed without retries against isolated emulators. Checks cover duplicate-send protection across refresh, service throttling and retry, account switching, continuation URLs, return-to-tab verification, actual owner workspace creation, invitation acceptance and revocation. Mobile invitation screenshot inspected. No synthetic production accounts or test emails were created/sent. The production sender change was read back independently, including unchanged default email body, subject, method and action handler.

References: https://firebase.google.com/docs/auth/web/passing-state-in-email-actions and https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config.

Production frontend build and hosting deployment completed successfully on 4 October 2026.


## Cloudflare DNS applied; certificate pending

Firebase provided these records on 4 October 2026. Domain status is HOST_UNHOSTED / OWNERSHIP_MISSING and certificate is CERT_VALIDATING at the latest provider check after DNS was configured. The full provider response is saved in RADBIT_AUTO_DOMAIN_STATUS.json. Re-read it before applying records if setup is delayed, especially the certificate TXT challenge.

| Type | Cloudflare name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | auto | studio-285787437-bc95b.web.app | DNS only |
| TXT | _acme-challenge.auto | NotBkHEu4g-vcalJGA8UJet_lIS7KOjUiHoSE2b5jzI | Not applicable |

CNAME is the required Hosting/ownership update; TXT is the provider-generated certificate DNS challenge. TTL may remain Auto. Preserve root website and existing mail records. After publishing, verify authoritative DNS, Firebase ownership/host/certificate state, HTTPS at the new URL, login, Google auth and actual authorised email continuation before announcing the new URL as ready. No redirect/canonical switch has been imposed on the working Firebase URL.


## Radbit Auto identity refresh
Replaced the generic arrow with a custom geometric R featuring road markings. Shared Brand component applies the same wordmark to landing, login and owner setup; workspace fallback uses the new symbol while agency identities remain intact. Versioned v2 SVG, 32px favicon, 180px Apple icon, 192/512px app icons and full-bleed maskable icon prevent reuse of cached old assets. Name remains the user-approved Radbit Auto. Regenerated real mobile/desktop installation previews. Local production checks passed at 320/390/768/1440px, including no overflow, navigation, signup, manifest and asset availability. Icon source: web/public/icons/radbit-auto-v2.svg; reproducible raster generation: web/scripts/build-brand-icons.mjs.
