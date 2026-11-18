import { test as base, expect, type Request } from '@playwright/test';

export { expect };

// The booking request; its response decides whether the app hands off to payment.
export const isBookingRequest = (request: Request) =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/api/v2/consultations';

export const PAYMENT_OPERATOR = /payu/i;

const PATIENT_URL = /\/api\/v2\/patients\/[0-9a-f-]{36}(\?|$)/;

// A write to the patient's own data (the personal data form saves with PATCH).
export const isPatientUpdate = (request: Request) => request.method() !== 'GET' && PATIENT_URL.test(request.url());

// The app reading the patient's data.
export const isPatientRead = (request: Request) => request.method() === 'GET' && PATIENT_URL.test(request.url());

type Fixtures = {
  stayOnAppDomain: void;
  blockPaymentOperator: void;
  noFreeSlots: void;
  incompletePersonalData: void;
};

export const test = base.extend<Fixtures>({
  // Hard stop: a top-level navigation to another domain (in any page, popups included) is aborted
  // before it loads, the page is closed so the test cannot go on there, and the test fails.
  // The payment operator is the expected handoff: blockPaymentOperator's page route aborts it first.
  stayOnAppDomain: [
    async ({ context, baseURL }, use) => {
      const appHost = new URL(baseURL!).host;
      const foreignNavigations: string[] = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const isTopLevel = request.isNavigationRequest() && !request.frame().parentFrame();
        if (!isTopLevel || !url.protocol.startsWith('http') || url.host === appHost) return route.fallback();
        foreignNavigations.push(request.url());
        await route.abort('blockedbyclient');
        await request.frame().page().close();
      });
      await use();
      expect(foreignNavigations, 'hard stop: the app navigated to another domain').toEqual([]);
    },
    { auto: true },
  ],

  // Never load the payment operator: the test ends at the handoff, and no payment may happen.
  // Requests to it are still observable with page.waitForRequest(PAYMENT_OPERATOR).
  blockPaymentOperator: [
    async ({ page }, use) => {
      await page.route(PAYMENT_OPERATOR, (route) => route.abort());
      await use();
    },
    { auto: true },
  ],

  // Slot search answers "no free slots", whatever the shared environment currently has.
  noFreeSlots: async ({ page }, use) => {
    await page.route(/\/api\/v2\/terms\//, (route) => route.fulfill({ json: { items: [], total: 0, count: 0 } }));
    await use();
  },

  // The patient's personal data looks incomplete, as for a new patient, so the app shows its
  // "Potrzebujemy Twoich danych!" form. Writes to the patient are aborted: nothing is saved on the shared account.
  incompletePersonalData: async ({ page }, use) => {
    await page.route(PATIENT_URL, async (route) => {
      if (route.request().method() !== 'GET') return route.abort();
      const response = await route.fetch();
      const patient = await response.json();
      patient.hasCompletePersonalData = false;
      patient.address = { ...patient.address, street: null, house_number: '1', apartment_number: null, postal_code: null, city: 'Warszawa', country: 'PL' };
      await route.fulfill({ response, json: patient });
    });
    await use();
  },});
