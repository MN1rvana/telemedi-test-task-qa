# Telemedi — testy E2E

Playwright + TypeScript, Chromium. Node.js ≥ 20.12.

## Uruchomienie
1. `npm install` — instaluje zależności i Chromium.
2. `cp .env.example .env` — wpisz `TELEMEDI_EMAIL` i `TELEMEDI_PASSWORD`.
3. `npm test` — uruchamia wszystkie testy.

| Polecenie | Działanie |
|---|---|
| `npm test -- --grep-invert @known-bug` | Uruchamia testy bez znanych błędów. |
| `npm run report` | Otwiera raport HTML. |
| `npm test -- --project=setup` | Loguje ponownie. Użyj, gdy sesja wygaśnie. |
| `npm test -- --ui` | Otwiera tryb UI bez logowania. Używa zapisanej sesji. |

## Testy — `tests/m_ponomar_test.spec.ts`
`@known-bug` — test znanego błędu. **Test może failować**: jest czerwony do poprawki. `@p1`–`@p3` — priorytet.

| Test | Powód |
|---|---|
| Rezerwacja recepty do przekazania płatności | Główna ścieżka zadania. Teraz czerwony: brak wolnych terminów, HTTP 400. |
| „Brak wolnych terminów” `@known-bug` | Brak terminów daje ogólny błąd zamiast komunikatu. |
| Wymagane zgody | Rezerwacja bez zgód nie może zostać wysłana. |
| „Zaznacz wszystkie” `@known-bug` | Pole zostaje zaznaczone po odznaczeniu zgód. `test.fail()`: nie blokuje CI. |
| Wizyta zdalna `@known-bug` (6) | Błędy z zadania 2. Opis: `report/BLEDY-wizyta-zdalna.md`. |
| Wizyta zdalna — nie błędy (3) | Pokazują zachowania sprawdzone jako poprawne. |
| API bez sesji | Dane pacjenta bez logowania: oczekiwane 401/403. `check-price` `@known-bug`: zwraca 200. |

## Zasady
- `retries: 0`. 1 worker: wszystkie testy używają jednego konta.
- Test nie płaci. Żądania do PayU są blokowane.
- Przejście na inną domenę zatrzymuje test (`stayOnAppDomain`).
- Testy nie zapisują danych na koncie.
- `npm test` maskuje dane logowania w logach i w `test-results/`.

Wyniki: `report/RAPORT.md`.
