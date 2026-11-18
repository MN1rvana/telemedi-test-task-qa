import fs from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config';

// The shared account locks for everyone after 5 wrong passwords:
// log in exactly once per run, never retry, and stop if this fails.
setup('log in to the shared account', async ({ page }) => {
  const missing = ['TELEMEDI_EMAIL', 'TELEMEDI_PASSWORD'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')} (see .env.example)`);

  // The cookie banner can cover the form; accept it whenever it shows up.
  await page.addLocatorHandler(page.getByRole('button', { name: 'Akceptuję' }), (button) => button.click());

  await page.goto('/pl/login');
  await page.getByRole('textbox', { name: 'E-mail, PESEL lub identyfikator' }).fill(process.env.TELEMEDI_EMAIL!);
  await page.getByRole('textbox', { name: 'Hasło' }).fill(process.env.TELEMEDI_PASSWORD!);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();

  await expect(page).not.toHaveURL(/\/login/);
  // Save only once the app has finished signing in: it stores the user in localStorage then, and without it
  // a page opened directly (not through the home page) never loads the patient.
  await expect(page.getByRole('button', { name: 'Umów się' })).toBeEnabled();
  fs.mkdirSync('playwright/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
