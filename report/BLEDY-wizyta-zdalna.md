# Raport błędów — „Wizyta zdalna” (szkic do Google Doc)

**Środowisko:** https://testyautomatyczne.telemedi.com/pl, Chromium (Playwright), 1280×720 i 375×812. **Data:** 16–18.11.2026.
**Konta:** własne konto testowe (eksploracja, w tym zapis adresu), konto współdzielone (testy automatyczne — tylko odczyt; stan „nowego pacjenta” symulowany w przeglądarce, zapisy przerywane).
**Priorytety:** P1 — psują ścieżkę pacjenta (błąd funkcji lub treści), P2 — dostępność i niezawodność, P3 — kosmetyczne i funkcjonalne o niskim ryzyku.
**Testy regresyjne:** `tests/m_ponomar_test.spec.ts`, blok `remote consultation (Wizyta zdalna)`, tagi `@known-bug` i `@p1`/`@p2`/`@p3`. Pisane jako pierwszy krok TDD: **czerwone do czasu poprawki**.
**Dowody:** zrzuty ekranu w `.scratch/wizyta/` (lokalnie, do wklejenia do dokumentu), nagrania testów w `report/videos/`.

---

## P1-1. Ulica złożona z samych spacji przechodzi walidację — serwer zapisuje `null`
- **Warunki:** konto z niepełnym adresem (np. nowe konto).
- **Kroki:** 1. Zaloguj się. 2. „Umów się” → „Wizyta zdalna” — pojawia się formularz „Potrzebujemy Twoich danych!”. 3. Ulica: 3 spacje; Nr domu: `0`; Nr lokalu: `-`; Kod pocztowy: `00-950`; Miejscowość: `123`. 4. „Zapisz”.
- **Oczekiwane:** przy polu Ulica „Pole jest wymagane”, dane nie są wysyłane.
- **Rzeczywiste:** `PATCH /api/v2/patients/{id}` z `"street":"   "` → **200**, w odpowiedzi `"street": null`. Pole Ulica nie jest oznaczane jako błędne.
- **Potwierdzone manualnie:** ulica złożona z samych spacji przechodzi walidację; formularz zapisuje się także z miejscowością `123` i numerem domu `-1`. Po zapisie pola nie są blokowane (wcześniejsza obserwacja z eksploracji o blokadzie pól nie potwierdziła się i została usunięta).
- **Dowody:** `run2-06-junk-filled.png`, `run2-07-junk-submit.png`; log API (żądanie i odpowiedź PATCH).
- **Test:** `tests/m_ponomar_test.spec.ts:153`.
- **Uwaga:** walidacja nie odrzuca też miejscowości `123` ani numeru domu `0` / `-1` — do decyzji biznesowej, jakie wartości są dopuszczalne.

## P1-2. Specjalizacja „lnternista” (małe L zamiast I) — wyszukiwanie „Inter” nic nie znajduje
- **Rodzaj:** błąd treści (dane w zarządzaniu treścią), nie błąd funkcji — wyszukiwarka działa poprawnie, błędna jest nazwa specjalizacji. Poprawka: zmiana nazwy w panelu, bez zmian w kodzie.
- **Kroki:** 1. „Umów się” → „Wizyta zdalna”. 2. Kliknij pole specjalizacji, wpisz `Inter`.
- **Oczekiwane:** na liście „Testy Automatyczne - Internista”.
- **Rzeczywiste:** „Brak wyników”. `GET /api/v2/specializations` zwraca nazwę `Testy Automatyczne - lnternista`; w tej czcionce „l” i „I” wyglądają identycznie, więc błąd jest niewidoczny, ale psuje wyszukiwanie. Potwierdzone manualnie.
- **Dowody:** `run7-01-search-Inter.png`; odpowiedź API.
- **Test:** `tests/m_ponomar_test.spec.ts:169` — pilnuje danych, nie kodu: zrobi się zielony po poprawce nazwy (sprawdzone „na zielono”: po podmianie nazwy na poprawną test przechodzi).

## P2-1. Elementy wyboru i komunikaty błędów niedostępne z klawiatury i dla czytników ekranu (dostępność)
- **Gdzie:**
  1. „Wizyta zdalna” — wybór kanału Telefon/Czat/Wideo.
  2. Formularz recepty — kafelki schorzeń oraz komunikaty „Pole jest wymagane” przy zgodach.
- **Kroki (1):** „Wizyta zdalna” → ustaw fokus w polu specjalizacji, naciskaj Tab.
- **Oczekiwane:** fokus przechodzi przez opcje kanału (grupa radio, stan zaznaczenia ogłaszany); kafelki schorzeń są przyciskami lub linkami; błędy walidacji są ogłaszane i powiązane z polem.
- **Rzeczywiste:**
  - kanały: fokus przeskakuje do linków w stopce; opcje to `<label for="3">` wskazujące na nieistniejący element `#3`; w drzewie dostępności brak roli radio;
  - kafelki schorzeń: brak roli przycisku lub linku;
  - „Pole jest wymagane”: brak `role="alert"` i `aria-describedby` — czytnik ekranu nie ogłasza błędu i nie wiąże go z polem.
  - Naruszone kryteria WCAG: 2.1.1, 4.1.2, 3.3.1.
- **Potwierdzone manualnie** (oba miejsca).
- **Test:** `tests/m_ponomar_test.spec.ts:180` (kanały); formularz recepty bez testu.

## P2-2. Na telefonie (375 px) cena w polu specjalizacji jest ucięta
- **Kroki:** „Wizyta zdalna” na ekranie 375 px.
- **Oczekiwane:** pełna cena, np. „39,00 PLN”.
- **Rzeczywiste:** „39,00 P…” / „49,0” — 25 px ceny ukryte (WCAG 1.4.10). Potwierdzone manualnie.
- **Dowody:** `run8-04-mobile-375.png`.
- **Test:** `tests/m_ponomar_test.spec.ts:188`.

## P3-1. Placeholder „Kod pocztowy*” ucięty
- **Kroki:** formularz „Potrzebujemy Twoich danych!”, puste pole Kod pocztowy.
- **Oczekiwane:** podpowiedź mieści się w polu.
- **Rzeczywiste:** „Kod pocztow” — tekst ok. 37 px szerszy niż pole. Tylko to pole pokazuje jednocześnie etykietę nad polem i podpowiedź. Potwierdzone manualnie.
- **Proponowane rozwiązanie:** zamiast powtarzać nazwę pola (jest już w etykiecie nad polem) pokazać przykład formatu, np. `00-001` — krótszy tekst mieści się w polu i od razu podpowiada format kodu.
- **Dowody:** `run1-03-wizyta-zdalna-start.png`.
- **Test:** `tests/m_ponomar_test.spec.ts:197` (sprawdza tylko, czy podpowiedź mieści się w polu, więc powinien przejść także po zmianie na `00-001` — niesprawdzone).

## P3-2. Po zmianie specjalizacji cena nie jest ponownie weryfikowana
- **Kroki:** 1. „Wizyta zdalna” — przy wejściu wysyłane jest `POST /api/v2/consultations/check-price` dla Internisty. 2. Zmień specjalizację na Dermatologa.
- **Oczekiwane:** nowe `check-price` z `specializationId` Dermatologa (cena, voucher, weryfikacja ubezpieczenia).
- **Rzeczywiste:** brak żądania. Wyświetlana cena (49,00 PLN) pochodzi z listy specjalizacji; voucher, zniżka i ubezpieczenie zostają policzone dla poprzedniej specjalizacji. Skutek finansowy niepotwierdzony (brak konta z voucherem). Potwierdzone manualnie (brak żądania).
- **Priorytet:** obniżony z P1 do P3 — płatność powinna ponownie zweryfikować cenę (niesprawdzone: brak wolnych terminów, płatność nieosiągnięta). Występuje przy każdej zmianie specjalizacji (formularz startuje z Internistą).
- **Dodatkowo:** w 1 z 5 powtórzeń testu `check-price` nie zostało wysłane nawet przy wejściu do formularza — cena wyświetlała się bez weryfikacji.
- **Dowody:** log sieci (`check-price` tylko dla `eac26890…`).
- **Test:** `tests/m_ponomar_test.spec.ts:217` (dopasowanie sprawdzone „na zielono”: gdy żądanie dla nowej specjalizacji zostaje wysłane, test przechodzi).

---

## Sprawdzone, nie są błędami
- „Wymagane zalogowanie na konto pacjenta.” przy kanałach Czat i Wideo — informacja, że ten kanał wymaga konta pacjenta (potwierdzone w teście manualnym).
- Strona główna przekierowuje pacjenta bez konsultacji do „Wizyty zdalnej” po ok. 1,6 s — zachowanie zamierzone (potwierdzone w teście manualnym). W automatyzacji kliknięcie menu „Umów się” w ciągu tych ~2 s trafiało na moment przekierowania; to ograniczenie skryptu, nie błąd.
- Bezpośredni link do formularza (`/pl/make-consultation`, także `/pl/make-prescription-consultation`) „zawieszał się” na spinnerze tylko w automatyzacji — nie potwierdzone manualnie. Przyczyna po naszej stronie: skrypt logowania zapisywał sesję, zanim aplikacja zapisała dane użytkownika (`user` w localStorage). Po poprawce (zapis sesji dopiero, gdy „Umów się” jest aktywne) oba linki otwierają formularz w ok. 3 s.
- „Kraj PL” zmienia się na „Polska” — ładowanie słownika krajów (`GET /api/v2/tools/countries`). Test: `tests/m_ponomar_test.spec.ts:235`.
- Spinner po zmianie kanału — wyszukiwanie terminów dla nowego kanału (`terms …?channel=1` dla Wideo); kończy się komunikatem „Niestety nie mamy w tej chwili wolnych terminów.”. Test: `tests/m_ponomar_test.spec.ts:245`.
- `gender` w żądaniu PATCH — formularz nie ma pola płci, ale aplikacja odsyła bieżącą wartość (odczyt `1`, zapis `1`), nie nadpisuje jej. Test: `tests/m_ponomar_test.spec.ts:255`.

## Poza zakresem / nieprzetestowane
- Wybór terminu i umówienie wizyty: w środowisku brak wolnych terminów (wszystkie specjalizacje i kanały, 3 i 14 dni).
- Płatność (PayU) — celowo blokowana w testach.

## Inne błędy znalezione przy zadaniu 1 (ścieżka recepty)
Potwierdzone manualnie:
- Brak terminów → front wysyła `date: "Invalid date"` → HTTP 400 i ogólny błąd „Wystąpił nieoczekiwany błąd”. Aplikacja wysyła wcześniej do analityki zdarzenie `error_NoAvailableDates`, więc wie o braku terminów. „Wizyta zdalna” pokazuje w tej sytuacji poprawny komunikat.
- `POST /api/v2/consultations/check-price` odpowiada 200 bez logowania: cena, weryfikacja ubezpieczenia i `invitationLink` wskazanego pacjenta (potwierdzone w Postmanie).
- „Zaznacz wszystkie” zostaje zaznaczone po odznaczeniu wszystkich zgód.
- Literówka „zobowiązny/a” → „zobowiązany/a”.
- „Anuluj” na ekranie zapisu do POZ prowadzi do `https://telemedi.com/pl` (domena produkcyjna).

Do potwierdzenia manualnego:
- **Przycisk płatnej konsultacji przez chwilę bez ceny, ale aktywny.**
  - **Kroki:** formularz recepty → wybierz lek (Alergimed…) → ekran „Twoja konsultacja z e-receptą”.
  - **Oczekiwane:** dopóki cena nie jest znana, przycisk jest nieaktywny lub pokazuje ładowanie.
  - **Rzeczywiste (30/30 prób w automatyzacji):** przycisk najpierw pokazuje „Umów za  PLN” i jest aktywny; cena „59.00 PLN” pojawia się po 316–1432 ms (mediana 357 ms), po odpowiedzi `check-price`. Skutek kliknięcia w tym czasie niesprawdzony (kliknięcie wysyła rezerwację).
  - **Jak zobaczyć manualnie:** DevTools → Network → ograniczenie prędkości (np. „Slow 4G”) wydłuża ten moment.
  - **Proponowany priorytet:** P3. **Test:** brak (do decyzji).

## Status weryfikacji manualnej
| Zgłoszenie | Status |
|---|---|
| P1-1 ulica ze spacji, miejscowość `123`, nr domu `-1` | ✅ potwierdzone; blokada pól — nie potwierdziła się, usunięta |
| P1-2 „lnternista” | ✅ potwierdzone (błąd treści) |
| P2-1 dostępność (kanały, kafelki schorzeń, komunikaty błędów) | ✅ potwierdzone |
| P2-2 ucięta cena na telefonie | ✅ potwierdzone |
| P3-1 podpowiedź kodu pocztowego | ✅ potwierdzone |
| P3-2 brak ponownej weryfikacji ceny | ✅ potwierdzone |
| Zadanie 1: brak terminów / `Invalid date` | ✅ znalezisko własne (manualne) |
| Zadanie 1: „Zaznacz wszystkie” | ✅ znalezisko własne (manualne) |
| Zadanie 1: `check-price` bez logowania | ✅ potwierdzone w Postmanie |
| Zadanie 1: literówka, „Anuluj” → domena produkcyjna | ✅ potwierdzone |
| Komunikat „Wymagane zalogowanie…”, przekierowanie strony głównej, bezpośredni link | ✅ sprawdzone — nie są błędami |
| „Kraj PL” → „Polska”, spinner po zmianie kanału, `gender` w PATCH | ⏳ ocena automatyzacji („nie błąd”) — zielone testy do prześledzenia w trybie UI: `tests/m_ponomar_test.spec.ts:235`, `:245`, `:255` |
| Przycisk „Umów za  PLN” bez ceny, aktywny | 🔁 odtworzone 30/30 w automatyzacji — przeniesione do usprawnień (U-2 w dokumencie Google) |
| Trackery zewnętrzne | ➖ pominięte (nieistotne w tym kontekście) |
