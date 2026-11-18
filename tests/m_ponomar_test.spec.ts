import { test as apiTest, type Locator, type Page } from '@playwright/test';
import { expect, isBookingRequest, isPatientRead, isPatientUpdate, PAYMENT_OPERATOR, test } from './fixtures';

const DRUG_OPTION = 'Alergimed, Levocetirizini dihydrochloridum, 5 mg, 1 tabl.';
const PRICE = '59.00 PLN';
const CONSENTS = [/^Jestem świadomy\/a, że po wypełnieniu/, /^Rozumiem, że umówienie e-konsultacji/, /^Rozumiem, że jestem/];
const REQUIRED = 'Pole jest wymagane';

async function openPrescriptionBooking(page: Page) {
  await test.step('open home page until "Umów się" is enabled', async () => {
    await page.goto('/pl');
    // Disabled until the app has refreshed the session.
    await expect(page.getByRole('button', { name: 'Umów się' })).toBeEnabled();
  });
  await test.step('open the prescription form', async () => {
    await page.getByRole('button', { name: 'Umów się' }).click();
    await page.getByRole('button', { name: /Recepta/ }).click();
    // The form loads in two stages (app shell, then form data); allow for a slow shared environment.
    await expect(page.getByRole('heading', { name: 'Wyszukaj lek' })).toBeVisible({ timeout: 30_000 });
  });
}

async function chooseDrug(page: Page) {
  await test.step('search and choose the drug', async () => {
    // react-select opens its menu only after a real click; fill() leaves it closed.
    await page.getByRole('combobox').click();
    await page.keyboard.type('Alergimed');
    await page.getByRole('option', { name: DRUG_OPTION, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Twoja konsultacja z e-receptą' })).toBeVisible();
  });
}

async function acceptConsents(page: Page) {
  await test.step('accept all consents', async () => {
    await page.getByText('Zaznacz wszystkie', { exact: true }).click();
    for (const consent of CONSENTS) {
      await expect(page.getByRole('checkbox', { name: consent })).toBeChecked();
    }
  });
}

// The validation message has no accessible link to its checkbox (no aria-describedby),
// so it is found through the wrapper that holds both.
const consentField = (page: Page, consent: RegExp) =>
  page.locator('.fk-input-wrapper').filter({ has: page.getByRole('checkbox', { name: consent }) });

test.describe('prescription consultation', () => {
  test('books a prescription consultation up to the payment handoff', async ({ page }) => {
    await openPrescriptionBooking(page);
    await chooseDrug(page);
    await acceptConsents(page);

    const bookingResponse = page.waitForResponse((response) => isBookingRequest(response.request()));
    const paymentHandoff = page.waitForRequest(PAYMENT_OPERATOR, { timeout: 30_000 });
    // Awaited below only if the booking succeeds; don't let it reject unhandled when the test fails earlier.
    paymentHandoff.catch(() => {});
    await page.getByRole('button', { name: `Umów za ${PRICE}` }).click();

    const booking = await bookingResponse;
    expect(booking.ok(), `booking rejected: HTTP ${booking.status()} ${await booking.text()}`).toBe(true);
    await paymentHandoff;
    // Until the cancellation flow is known (no free slots to explore it yet), a created booking must not go unnoticed.
    throw new Error(`Booking created (${await booking.text()}): cancellation not implemented yet — cancel it manually`);
  });

  test('shows a "no free dates" message instead of a generic error when no slot is available @known-bug', async ({ page, noFreeSlots }) => {
    const sentDates: unknown[] = [];
    page.on('request', (request) => {
      if (isBookingRequest(request)) sentDates.push(request.postDataJSON()?.date);
    });

    await openPrescriptionBooking(page);
    await chooseDrug(page);
    await acceptConsents(page);
    await page.getByRole('button', { name: `Umów za ${PRICE}` }).click();

    // Expected: the app's booking-outcome card (h2 header, like "Wystąpił nieoczekiwany błąd") naming the real cause.
    // Wait for whichever outcome card renders first, so a red run fails fast instead of waiting out the timeout.
    const noFreeDates = page.getByRole('heading', { level: 2, name: /brak wolnych terminów/i });
    const genericError = page.getByRole('heading', { level: 2, name: 'Wystąpił nieoczekiwany błąd' });
    await expect(noFreeDates.or(genericError)).toBeVisible();
    expect.soft(await noFreeDates.isVisible(), 'expected the "Brak wolnych terminów" card, got the generic "Wystąpił nieoczekiwany błąd"').toBe(true);
    expect(sentDates, 'the booking must not be sent with an invalid date').not.toContain('Invalid date');
  });

  test('requires every consent and marks each missing one before booking', async ({ page }) => {
    const bookingRequests: string[] = [];
    page.on('request', (request) => {
      if (isBookingRequest(request)) bookingRequests.push(request.url());
    });

    await openPrescriptionBooking(page);
    await chooseDrug(page);
    // Tick only the middle consent, so each message can be tied to its own unticked consent.
    const [first, ticked, last] = CONSENTS;
    await page.getByText(ticked).click();
    await expect(page.getByRole('checkbox', { name: ticked })).toBeChecked();
    await page.getByRole('button', { name: `Umów za ${PRICE}` }).click();

    await expect(consentField(page, first).getByText(REQUIRED)).toBeVisible();
    await expect(consentField(page, last).getByText(REQUIRED)).toBeVisible();
    await expect(consentField(page, ticked).getByText(REQUIRED)).toBeHidden();
    expect(bookingRequests, 'no booking request may be sent while a consent is missing').toEqual([]);
  });

  test('clears "Zaznacz wszystkie" when every consent is unticked again @known-bug', async ({ page }) => {
    test.fail(true, 'Known visual bug: "Zaznacz wszystkie" stays ticked after all consents are unticked. Reported for triage; kept out of the red CI signal.');

    await openPrescriptionBooking(page);
    await chooseDrug(page);
    await acceptConsents(page);
    for (const consent of CONSENTS) {
      await page.getByText(consent).click();
      await expect(page.getByRole('checkbox', { name: consent })).not.toBeChecked();
    }

    // Each consent's unticked state is already confirmed above, so this state is settled: a short timeout,
    // so the expected failure doesn't cost the full expect timeout on every CI run.
    await expect(page.getByRole('checkbox', { name: 'Zaznacz wszystkie' })).not.toBeChecked({ timeout: 2_000 });
  });
});

const PHONE_INFO = 'Lekarz zadzwoni na twój telefon.';
const PERSONAL_DATA_FORM = 'Potrzebujemy Twoich danych!';

async function openRemoteConsultation(page: Page) {
  await test.step('open the remote consultation form', async () => {
    await page.goto('/pl');
    await expect(page.getByRole('button', { name: 'Umów się' })).toBeEnabled();
    await page.getByRole('button', { name: 'Umów się' }).click();
    await page.getByRole('button', { name: /Wizyta zdalna/ }).click();
    // Specializations, channels and slots load separately; the combobox and the phone channel's info mark a usable form.
    await expect(page.getByRole('combobox')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(PHONE_INFO)).toBeVisible();
  });
}

// How many pixels of the element are hidden by the nearest ancestor that clips its overflow.
const clippedPixels = (locator: Locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX === 'visible') continue;
      const clip = parent.getBoundingClientRect();
      return Math.max(0, Math.round(box.right - clip.right), Math.round(clip.left - box.left));
    }
    return 0;
  });

// Bugs found while exploring "Wizyta zdalna" (Task 2), written test-first: each stays red until its bug is fixed.
// Priority tags: @p1 functional, @p2 accessibility and robustness, @p3 visual polish and low-risk functional gaps.
test.describe('remote consultation (Wizyta zdalna)', () => {
  test('rejects a whitespace-only street in the personal data form @known-bug @p1', async ({ page, incompletePersonalData }) => {
    await page.goto('/pl');
    await expect(page.getByRole('heading', { name: PERSONAL_DATA_FORM })).toBeVisible({ timeout: 30_000 });
    const street = page.getByRole('textbox', { name: 'Ulica*' });
    await street.fill('   ');
    await page.getByRole('textbox', { name: 'Kod pocztowy*' }).fill('00-950');

    // Whichever comes first: the update is sent (the fixture aborts it, nothing is saved), or the street is marked invalid.
    const outcome = Promise.race([
      page.waitForRequest(isPatientUpdate).then((request) => `sent ${request.postData()}`, () => 'no update sent'),
      street.and(page.locator('[aria-invalid="true"]')).waitFor().then(() => 'street rejected', () => 'street not marked invalid'),
    ]);
    await page.getByRole('button', { name: 'Zapisz' }).click();
    expect(await outcome, 'a whitespace-only street must be rejected by the form (the server saves it as null)').toBe('street rejected');
  });

  test('finds the internist when searching the specializations for "Inter" @known-bug @p1', async ({ page }) => {
    await openRemoteConsultation(page);
    await page.getByRole('combobox').click();
    await page.keyboard.type('Inter');

    // Wait for whichever the list shows, so a red run fails fast instead of waiting out the timeout.
    const internist = page.getByRole('option', { name: /Internista/ });
    await expect(internist.or(page.getByText('Brak wyników', { exact: true }))).toBeVisible();
    expect(await internist.isVisible(), 'searching "Inter" finds nothing: the specialization is named "lnternista" (lowercase L)').toBe(true);
  });

  test('exposes the communication channels as radio buttons @known-bug @p2', async ({ page }) => {
    await openRemoteConsultation(page);
    // The options render together with the phone info, so their state is settled: a short timeout is enough.
    await expect(page.getByRole('radio', { name: 'Telefon' }), 'the channel options are not radio buttons: keyboard and screen-reader users cannot choose a channel').toBeChecked({ timeout: 2_000 });
    await page.getByRole('radio', { name: 'Czat' }).check();
    await expect(page.getByRole('radio', { name: 'Telefon' })).not.toBeChecked();
  });

  test('shows the whole price in the specialization field on a phone screen @known-bug @p2', async ({ page }) => {
    await openRemoteConsultation(page);
    await page.setViewportSize({ width: 375, height: 812 });
    // On a phone the field is a button showing the specialization and its price (\s: the app may use a no-break space).
    const price = page.getByRole('button', { name: /PLN/ }).getByText(/^\d+,\d{2}\sPLN$/);
    await expect(price).toBeVisible();
    expect(await clippedPixels(price), 'pixels of the price cut off by the field').toBe(0);
  });

  test('shows the whole postal code placeholder in the personal data form @known-bug @p3', async ({ page, incompletePersonalData }) => {
    await page.goto('/pl');
    await expect(page.getByRole('heading', { name: PERSONAL_DATA_FORM })).toBeVisible({ timeout: 30_000 });
    const postal = page.getByRole('textbox', { name: 'Kod pocztowy*' });
    await expect(postal).toBeEmpty();

    // Placeholder text width (in the field's own font) against the room inside the field.
    const overflow = await postal.evaluate(async (el) => {
      const input = el as HTMLInputElement;
      await document.fonts.ready;
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = style.font;
      const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return Math.round(context.measureText(input.placeholder).width - room);
    });
    expect(overflow, 'pixels of the placeholder "Kod pocztowy*" that do not fit the field').toBeLessThanOrEqual(0);
  });

  // @p3: payment should validate the price again (not verified: no free slots, so checkout was never reached).
  test('re-checks the price after switching the specialization @known-bug @p3', async ({ page }) => {
    // The id comes from the list the app loads; the check-price on load is not awaited (in 1 of 5 runs the app never sent it).
    const specializations = page.waitForResponse(/api\/v2\/specializations/);
    await openRemoteConsultation(page);
    const { items } = await (await specializations).json();
    const dermatologist = items.find((item: { name: string }) => /Dermatolog/.test(item.name)).id;

    // The re-check should follow the switch at once; 10 s is generous.
    const recheck = page.waitForRequest((request) => /check-price/.test(request.url()) && request.postDataJSON()?.specializationId === dermatologist, { timeout: 10_000 });
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Dermatolog/ }).click();
    const rechecked = await recheck.then(() => true, () => false);
    expect(rechecked, 'check-price (price, voucher and insurance check) was not sent again for the newly chosen specialization').toBe(true);
  });
});

// Behaviour noticed while exploring that looked odd but is correct; each test shows the path and the expected end state.
test.describe('remote consultation: checked, not bugs', () => {
  test('shows the country name, not its code, in the personal data form', async ({ page, incompletePersonalData }) => {
    const countryList = page.waitForResponse(/api\/v2\/tools\/countries/);
    await page.goto('/pl');
    await expect(page.getByRole('heading', { name: PERSONAL_DATA_FORM })).toBeVisible({ timeout: 30_000 });
    await countryList;
    // The patient's data holds the code "PL" (the fixture sets it for the address); until the country list
    // has loaded the fields may show the code. Two fields: the one next to PESEL and the address one.
    await expect(page.getByRole('button', { name: /^Kraj/ })).toHaveText(['Polska', 'Polska']);
  });

  test('searches the slots again for the newly chosen channel and ends with the no-slots message', async ({ page, noFreeSlots }) => {
    await openRemoteConsultation(page);
    // Channel ids in the slot search: Wideo 1, Telefon 2, Czat 3.
    const videoSlots = page.waitForRequest((request) => /\/api\/v2\/terms\//.test(request.url()) && new URL(request.url()).searchParams.get('channel') === '1', { timeout: 10_000 });
    await page.getByText('Wideo', { exact: true }).click();
    await videoSlots;
    // The spinner shown meanwhile is this search; with no free slots it ends with the app's message.
    await expect(page.getByText('Niestety nie mamy w tej chwili wolnych terminów.')).toBeVisible();
  });

  test("sends the patient's current gender unchanged when saving the personal data form", async ({ page, incompletePersonalData }) => {
    const patient = page.waitForResponse((response) => isPatientRead(response.request()));
    await page.goto('/pl');
    await expect(page.getByRole('heading', { name: PERSONAL_DATA_FORM })).toBeVisible({ timeout: 30_000 });
    const { gender } = await (await patient).json();
    await page.getByRole('textbox', { name: 'Ulica*' }).fill('Testowa');
    await page.getByRole('textbox', { name: 'Kod pocztowy*' }).fill('00-950');

    // The form has no gender field, yet the update carries one: it must be the value the app read.
    // The fixture aborts the update, so nothing is saved.
    const update = page.waitForRequest(isPatientUpdate);
    await page.getByRole('button', { name: 'Zapisz' }).click();
    expect((await update).postDataJSON().gender, "the update changes the patient's gender").toBe(gender);
  });
});

// Every endpoint that returns or changes a patient's data must refuse an anonymous caller.
// Public catalog endpoints (specializations, free slots, drug search, exam points) are not listed.
const API_URL = 'https://testyautomatyczne.telemedi.co';
const PATIENT_ID = 'd683092f-5298-46bd-9e47-b8b50892efd5'; // the shared test patient; any real id must be refused
const PRESCRIPTION_SPECIALIZATION_ID = 'd6b311e2-55b6-429c-8ce7-5cd574044e13';

// Exact statuses: what each endpoint answers an anonymous caller today (mostly 401, exams 403).
const PATIENT_ENDPOINTS: { method: 'GET' | 'POST'; path: string; data?: object; status: 401 | 403; knownBug?: boolean }[] = [
  { method: 'GET', path: '/api/v2/consultations', status: 401 },
  { method: 'GET', path: '/api/v2/patients/current/exams', status: 403 },
  { method: 'GET', path: `/api/v2/patients/${PATIENT_ID}`, status: 401 },
  { method: 'GET', path: `/api/v2/voucher/patient/${PATIENT_ID}`, status: 401 },
  // Empty body: even if the endpoint were open, nothing could be booked.
  { method: 'POST', path: '/api/v2/consultations', data: {}, status: 401 },
  {
    method: 'POST',
    path: '/api/v2/consultations/check-price',
    // The payload the app itself sends: a named patient's price and insurance check.
    data: {
      specializationId: PRESCRIPTION_SPECIALIZATION_ID,
      patientId: PATIENT_ID,
      doctorId: null,
      directContact: false,
      currency: 'PLN',
      doctorSpecializationServiceType: null,
      verifyInsurance: true,
    },
    // Answers 200 today; expected to be refused as forbidden.
    status: 403,
    knownBug: true,
  },
];

// Plain Playwright test, without the page-based fixtures: no browser, no video for API checks.
apiTest.describe('API without a session', () => {
  for (const { method, path, data, status, knownBug } of PATIENT_ENDPOINTS) {
    apiTest(`refuses ${method} ${path} to an anonymous caller with ${status}${knownBug ? ' @known-bug' : ''}`, async ({ playwright }) => {
      // A fresh context: no storageState, no cookies, no auth header.
      const api = await playwright.request.newContext({ baseURL: API_URL });
      const response = await api.fetch(path, { method, data });
      expect(response.status(), `${method} ${path} answered HTTP ${response.status()} to an anonymous caller, expected ${status}`).toBe(status);
      await api.dispose();
    });
  }
});
