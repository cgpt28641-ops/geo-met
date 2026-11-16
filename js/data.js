// Baza wiedzy GeoGuessr meta (PL).
// Źródła inspiracji: Plonk It, GeoHints, geotips.net, LearnableMeta, r/geoguessr.
// Meta się zmienia (nowe pokrycie Google) — traktuj wskazówki jako prawdopodobieństwo, nie pewnik.

window.CLUE_LABELS = {
  tablice: { label: 'Tablice rejestracyjne', icon: '🚗' },
  slupki: { label: 'Słupki drogowe', icon: '📍' },
  linie: { label: 'Linie na drodze', icon: '🛣️' },
  jezyk: { label: 'Język i pismo', icon: '🔤' },
  znaki: { label: 'Znaki drogowe', icon: '⚠️' },
  kamera: { label: 'Samochód / kamera', icon: '📷' },
  inne: { label: 'Krajobraz i inne', icon: '🌄' },
};

window.REGIONS = ['Europa', 'Ameryka Płn.', 'Ameryka Płd.', 'Azja', 'Afryka', 'Oceania'];

// drive: 'L' = ruch lewostronny, 'R' = prawostronny
// diff: 1 = łatwy, 2 = średni, 3 = trudny
window.COUNTRIES = [
  // ───────────── EUROPA ─────────────
  {
    id: 'pl', name: 'Polska', region: 'Europa', drive: 'R', domain: '.pl', phone: '+48', diff: 1,
    clues: {
      tablice: 'Białe tablice UE; pierwsza litera to województwo (W – mazowieckie, K – małopolskie, P – wielkopolskie, G – pomorskie).',
      slupki: 'Białe słupki z czarnym ukośnym pasem u góry i czerwonym odblaskiem.',
      linie: 'Białe linie; żółte tylko tymczasowe (roboty drogowe).',
      jezyk: 'Litery ł, ą, ę, ś, ź, ż, ć, ń. Słowa: „ulica”, „sklep”, „apteka”.',
      znaki: 'Znaki ostrzegawcze trójkątne z ŻÓŁTYM tłem i czerwoną ramką.',
      inne: 'Betonowe słupy energetyczne z otworami, płoty z siatki, dużo nowego pokrycia Gen 4.',
    },
    tips: ['Żółte znaki ostrzegawcze + czerwono-biało-czarny słupek = prawie na pewno Polska.'],
  },
  {
    id: 'cz', name: 'Czechy', region: 'Europa', drive: 'R', domain: '.cz', phone: '+420', diff: 2,
    clues: {
      tablice: 'Białe tablice UE; druga pozycja to litera kraju (regionu), np. 1A2 3456 (A = Praga).',
      slupki: 'Białe z czarnym pasem u góry i pomarańczowymi odblaskami (tak jak na Słowacji).',
      jezyk: 'Litery ř, ě, ů — występują tylko w czeskim.',
    },
    tips: ['Widzisz „ř” lub „ů”? To Czechy, nie Słowacja.'],
  },
  {
    id: 'sk', name: 'Słowacja', region: 'Europa', drive: 'R', domain: '.sk', phone: '+421', diff: 2,
    clues: {
      tablice: 'Białe tablice UE; dwie pierwsze litery to kod powiatu (BA – Bratysława, KE – Koszyce).',
      slupki: 'Białe z czarnym pasem i pomarańczowymi odblaskami (prawie identyczne jak w Czechach).',
      jezyk: 'Litery ä, ľ, ĺ, ô, ŕ — brak ř i ů.',
    },
    tips: ['„ô” i „ľ” odróżniają słowacki od czeskiego.'],
  },
  {
    id: 'de', name: 'Niemcy', region: 'Europa', drive: 'R', domain: '.de', phone: '+49', diff: 2,
    clues: {
      tablice: 'Długie białe tablice UE: 1–3 litery miasta, dwie okrągłe naklejki, potem litery i cyfry.',
      slupki: 'Białe z czarnym pasem; z jednej strony biały owalny odblask, z drugiej dwa małe.',
      jezyk: 'ä, ö, ü, ß. Końcówki: -straße, -dorf, -hausen, -berg.',
      znaki: 'Żółte tablice z nazwą miejscowości.',
      kamera: 'Dużo starego pokrycia Gen 3 (2008–09) i nowe Gen 4 od 2023 r.; wiele rozmytych domów.',
    },
    tips: ['Rozmyte budynki w Europie Zachodniej często wskazują Niemcy.'],
  },
  {
    id: 'at', name: 'Austria', region: 'Europa', drive: 'R', domain: '.at', phone: '+43', diff: 2,
    clues: {
      tablice: 'Białe z czerwono-białymi paskami wzdłuż górnej i dolnej krawędzi.',
      jezyk: 'Niemiecki; nazwy na -dorf, -kirchen, -berg.',
      inne: 'Alpy, drewniane balkony z kwiatami, zadbane wsie.',
    },
  },
  {
    id: 'ch', name: 'Szwajcaria', region: 'Europa', drive: 'R', domain: '.ch', phone: '+41', diff: 2,
    clues: {
      tablice: 'Nie UE: białe, z flagą Szwajcarii i herbem kantonu; tylna tablica krótka i wysoka.',
      linie: 'ŻÓŁTE przejścia dla pieszych i żółte linie miejsc parkingowych.',
      jezyk: 'Niemiecki, francuski, włoski (i retoromański).',
      znaki: 'Autostrady oznaczone na zielono, drogi główne na niebiesko.',
    },
    tips: ['Żółta „zebra” w Europie = Szwajcaria.'],
  },
  {
    id: 'fr', name: 'Francja', region: 'Europa', drive: 'R', domain: '.fr', phone: '+33', diff: 1,
    clues: {
      tablice: 'Białe z niebieskimi paskami po OBU stronach; na prawym numer departamentu.',
      slupki: 'Białe z czerwonym odblaskowym pasem.',
      linie: 'Białe; krótkie, gęsto przerywane linie krawędziowe.',
      jezyk: 'é, è, ê, ç; „Rue”, „Route”, „Boulangerie”.',
      znaki: 'Tablice miejscowości białe z czerwoną ramką; czerwono-białe szewrony na zakrętach.',
    },
  },
  {
    id: 'be', name: 'Belgia', region: 'Europa', drive: 'R', domain: '.be', phone: '+32', diff: 2,
    clues: {
      tablice: 'Białe z CZERWONYM tekstem — unikalne w Europie.',
      jezyk: 'Francuski na południu (Walonia), niderlandzki na północy (Flandria).',
      inne: 'Betonowe drogi z poprzecznymi szczelinami, ceglane domy.',
    },
    tips: ['Czerwone litery na tablicy = Belgia.'],
  },
  {
    id: 'nl', name: 'Holandia', region: 'Europa', drive: 'R', domain: '.nl', phone: '+31', diff: 1,
    clues: {
      tablice: 'ŻÓŁTE z przodu i z tyłu, długie.',
      jezyk: 'Częste „ij”, „straat”, „weg”, „-dijk”.',
      inne: 'Czerwone asfaltowe ścieżki rowerowe, płasko, kanały, cegła.',
    },
  },
  {
    id: 'lu', name: 'Luksemburg', region: 'Europa', drive: 'R', domain: '.lu', phone: '+352', diff: 3,
    clues: {
      tablice: 'Żółte (jak w Holandii), ale krótki numer.',
      jezyk: 'Francuskie nazwy ulic, luksemburskie i niemieckie napisy.',
    },
  },
  {
    id: 'gb', name: 'Wielka Brytania', region: 'Europa', drive: 'L', domain: '.uk', phone: '+44', diff: 1,
    clues: {
      tablice: 'Biała z przodu, ŻÓŁTA z tyłu; format AB12 CDE.',
      linie: 'Podwójne żółte linie przy krawężniku (zakaz parkowania); białe linie środkowe.',
      znaki: 'Prędkość i odległości w milach.',
      inne: 'Żywopłoty, ceglane szeregowce, budki telefoniczne.',
    },
    tips: ['Ruch lewostronny w Europie: Wielka Brytania, Irlandia, Malta, Cypr.'],
  },
  {
    id: 'ie', name: 'Irlandia', region: 'Europa', drive: 'L', domain: '.ie', phone: '+353', diff: 1,
    clues: {
      tablice: 'Białe z przodu i z tyłu; rok + kod hrabstwa, np. 191-D-12345.',
      linie: 'ŻÓŁTE linie krawędziowe (w UK białe).',
      jezyk: 'Dwujęzyczne napisy: irlandzki + angielski.',
      znaki: 'Żółte rombowe znaki ostrzegawcze; odległości w km.',
    },
    tips: ['Ruch lewostronny + żółte rombowe znaki w Europie = Irlandia.'],
  },
  {
    id: 'es', name: 'Hiszpania', region: 'Europa', drive: 'R', domain: '.es', phone: '+34', diff: 1,
    clues: {
      tablice: 'Białe UE, format 1234 ABC — bez kodu regionu.',
      jezyk: 'ñ, „Calle”, „Avenida”; w regionach katalońskie, baskijskie lub galicyjskie napisy.',
      inne: 'Suche krajobrazy, gaje oliwne, białe miasteczka.',
    },
  },
  {
    id: 'pt', name: 'Portugalia', region: 'Europa', drive: 'R', domain: '.pt', phone: '+351', diff: 2,
    clues: {
      tablice: 'Starsze tablice z ŻÓŁTYM paskiem po prawej stronie (rok i miesiąc).',
      jezyk: 'ã, õ, ç; „Rua”, końcówki „-ão”.',
      inne: 'Białe domy z pomarańczową dachówką, eukaliptusy.',
    },
  },
  {
    id: 'it', name: 'Włochy', region: 'Europa', drive: 'R', domain: '.it', phone: '+39', diff: 1,
    clues: {
      tablice: 'Niebieskie paski po obu stronach (jak we Francji); prawy z rokiem i kodem prowincji.',
      jezyk: '„Via”, „Strada”, „Piazza”; słowa kończące się na samogłoski.',
      inne: 'Domy w ciepłych kolorach (żółte, pomarańczowe), cyprysy.',
    },
  },
  {
    id: 'gr', name: 'Grecja', region: 'Europa', drive: 'R', domain: '.gr', phone: '+30', diff: 1,
    clues: {
      jezyk: 'Alfabet grecki (Σ, Ω, Δ, λ); nazwy często też w łacince.',
      inne: 'Płaskie dachy z wystającymi prętami zbrojeniowymi, gaje oliwne, kapliczki przydrożne.',
    },
  },
  {
    id: 'hu', name: 'Węgry', region: 'Europa', drive: 'R', domain: '.hu', phone: '+36', diff: 2,
    clues: {
      jezyk: 'Litery ő i ű (podwójny akcent); „utca”, „út”.',
      inne: 'Płaska nizina, słupy energetyczne z betonu.',
    },
  },
  {
    id: 'ro', name: 'Rumunia', region: 'Europa', drive: 'R', domain: '.ro', phone: '+40', diff: 2,
    clues: {
      jezyk: 'ă, â, î, ș, ț; „Strada”.',
      inne: 'Wozy konne, cerkwie z blaszanymi dachami, długie wsie wzdłuż drogi.',
    },
  },
  {
    id: 'bg', name: 'Bułgaria', region: 'Europa', drive: 'R', domain: '.bg', phone: '+359', diff: 2,
    clues: {
      jezyk: 'Cyrylica z literami ъ i щ (często), brak ы.',
    },
    tips: ['Cyrylica w UE = Bułgaria.'],
  },
  {
    id: 'rs', name: 'Serbia', region: 'Europa', drive: 'R', domain: '.rs', phone: '+381', diff: 2,
    clues: {
      jezyk: 'Cyrylica z literami ђ, ћ, џ, љ, њ, ј oraz łacinka.',
    },
    tips: ['Litera „ј” w cyrylicy = Serbia lub Macedonia Płn.'],
  },
  {
    id: 'hr', name: 'Chorwacja', region: 'Europa', drive: 'R', domain: '.hr', phone: '+385', diff: 2,
    clues: {
      jezyk: 'č, ć, đ, š, ž; „ulica”, „cesta”.',
      inne: 'Wybrzeże Adriatyku, kamienne murki, czerwone dachy.',
    },
  },
  {
    id: 'si', name: 'Słowenia', region: 'Europa', drive: 'R', domain: '.si', phone: '+386', diff: 3,
    clues: {
      jezyk: 'Tylko č, š, ž (bez ć i đ); „cesta”.',
      inne: 'Alpejskie krajobrazy, drewniane spichlerze „kozolec”.',
    },
  },
  {
    id: 'se', name: 'Szwecja', region: 'Europa', drive: 'R', domain: '.se', phone: '+46', diff: 2,
    clues: {
      linie: 'Białe linie środkowe (w Norwegii i Finlandii żółte).',
      jezyk: 'å, ä, ö; „gatan”, „vägen”.',
      znaki: 'Znaki ostrzegawcze z żółtym tłem.',
      inne: 'Czerwone drewniane domy, lasy iglaste.',
    },
  },
  {
    id: 'no', name: 'Norwegia', region: 'Europa', drive: 'R', domain: '.no', phone: '+47', diff: 1,
    clues: {
      slupki: 'Czarne słupki z żółtym odblaskiem.',
      linie: 'ŻÓŁTE linie środkowe, białe krawędziowe.',
      jezyk: 'æ, ø, å; „veien”, „gata”.',
      inne: 'Fiordy, góry, tunele.',
    },
  },
  {
    id: 'fi', name: 'Finlandia', region: 'Europa', drive: 'R', domain: '.fi', phone: '+358', diff: 1,
    clues: {
      linie: 'ŻÓŁTE linie środkowe.',
      jezyk: 'ä, ö, mnóstwo podwójnych liter (kk, aa, tt); „-katu”, „-tie”.',
      znaki: 'Znaki ostrzegawcze z żółtym tłem.',
      inne: 'Płasko, jeziora, brzozy i sosny.',
    },
  },
  {
    id: 'dk', name: 'Dania', region: 'Europa', drive: 'R', domain: '.dk', phone: '+45', diff: 2,
    clues: {
      jezyk: 'æ, ø, å; „-vej”, „-gade”.',
      inne: 'Płasko, pola uprawne, białe i ceglane domy z czerwonymi dachami.',
    },
  },
  {
    id: 'ee', name: 'Estonia', region: 'Europa', drive: 'R', domain: '.ee', phone: '+372', diff: 3,
    clues: { jezyk: 'Litera õ oraz ä, ö, ü; „tänav”, „mnt” (maantee).' },
  },
  {
    id: 'lv', name: 'Łotwa', region: 'Europa', drive: 'R', domain: '.lv', phone: '+371', diff: 3,
    clues: { jezyk: 'Litery z kreską: ā, ē, ī, ū oraz ķ, ļ, ņ, ģ; „iela”.' },
  },
  {
    id: 'lt', name: 'Litwa', region: 'Europa', drive: 'R', domain: '.lt', phone: '+370', diff: 3,
    clues: { jezyk: 'ą, č, ę, ė, į, š, ų, ū, ž; „gatvė”.' },
    tips: ['„ė” (e z kropką) = Litwa.'],
  },
  {
    id: 'ru', name: 'Rosja', region: 'Europa', drive: 'R', domain: '.ru', phone: '+7', diff: 2,
    clues: {
      jezyk: 'Cyrylica z literami ы i э.',
      kamera: 'Często czarny samochód z długą anteną.',
    },
  },
  {
    id: 'ua', name: 'Ukraina', region: 'Europa', drive: 'R', domain: '.ua', phone: '+380', diff: 2,
    clues: { jezyk: 'Cyrylica z literami і, ї, є, ґ (bez ы i э).' },
  },
  {
    id: 'tr', name: 'Turcja', region: 'Europa', drive: 'R', domain: '.tr', phone: '+90', diff: 2,
    clues: {
      tablice: 'Białe z niebieskim paskiem „TR”; zaczynają się od numeru prowincji (34 – Stambuł, 06 – Ankara).',
      jezyk: 'ğ, ş, ı (i bez kropki), ç; „Cadde”, „Sokak”.',
      inne: 'Meczety z minaretami, budynki z niedokończonymi piętrami.',
    },
  },

  // ───────────── AMERYKA PÓŁNOCNA ─────────────
  {
    id: 'us', name: 'USA', region: 'Ameryka Płn.', drive: 'R', domain: '.us', phone: '+1', diff: 1,
    clues: {
      tablice: 'Kolor zależy od stanu; w wielu stanach brak przedniej tablicy.',
      linie: 'ŻÓŁTA linia środkowa, białe krawędziowe.',
      znaki: 'Żółte rombowe znaki ostrzegawcze, „SPEED LIMIT” w mph.',
      inne: 'Szerokie drogi, drewniane słupy energetyczne, skrzynki pocztowe przy drodze.',
    },
  },
  {
    id: 'ca', name: 'Kanada', region: 'Ameryka Płn.', drive: 'R', domain: '.ca', phone: '+1', diff: 1,
    clues: {
      tablice: 'W wielu prowincjach tylko tylna tablica.',
      linie: 'ŻÓŁTA linia środkowa.',
      jezyk: 'Angielski; w Quebecu francuski („ARRÊT” na znaku stop).',
      znaki: 'Prędkość w km/h (w USA mph).',
    },
    tips: ['Krajobraz jak w USA, ale km/h = Kanada.'],
  },
  {
    id: 'mx', name: 'Meksyk', region: 'Ameryka Płn.', drive: 'R', domain: '.mx', phone: '+52', diff: 1,
    clues: {
      jezyk: 'Hiszpański; znak stop: „ALTO”.',
      znaki: 'Progi zwalniające „TOPES”.',
      inne: 'Kolorowe betonowe domy, reklamy malowane na ścianach.',
    },
  },
  {
    id: 'gt', name: 'Gwatemala', region: 'Ameryka Płn.', drive: 'R', domain: '.gt', phone: '+502', diff: 3,
    clues: {
      jezyk: 'Hiszpański; „ALTO”.',
      inne: 'Wulkany, kolorowe „chicken busy”, góry.',
    },
  },

  // ───────────── AMERYKA POŁUDNIOWA ─────────────
  {
    id: 'br', name: 'Brazylia', region: 'Ameryka Płd.', drive: 'R', domain: '.br', phone: '+55', diff: 1,
    clues: {
      tablice: 'Mercosur: biała z niebieskim paskiem u góry (starsze szare).',
      linie: 'ŻÓŁTE linie środkowe.',
      jezyk: 'Portugalski: „Rua”, „Avenida”, ç, ão; znak stop „PARE”.',
      inne: 'Czerwona ziemia, kolorowe niskie domy z kratami, budki telefoniczne „orelhão”.',
    },
  },
  {
    id: 'ar', name: 'Argentyna', region: 'Ameryka Płd.', drive: 'R', domain: '.ar', phone: '+54', diff: 2,
    clues: {
      tablice: 'Mercosur (biała z niebieskim paskiem) lub stare czarne.',
      jezyk: 'Hiszpański; „PARE”.',
      inne: 'Pampa, płasko, Patagonia na południu.',
    },
  },
  {
    id: 'cl', name: 'Chile', region: 'Ameryka Płd.', drive: 'R', domain: '.cl', phone: '+56', diff: 2,
    clues: {
      linie: 'Białe linie środkowe (rzadkość w Ameryce Płd.).',
      jezyk: 'Hiszpański; „PARE”.',
      inne: 'Andy w tle, pustynia Atakama na północy.',
    },
  },
  {
    id: 'co', name: 'Kolumbia', region: 'Ameryka Płd.', drive: 'R', domain: '.co', phone: '+57', diff: 1,
    clues: {
      tablice: 'ŻÓŁTE tablice z czarnym tekstem.',
      linie: 'Żółte linie środkowe.',
      jezyk: 'Hiszpański; „PARE”.',
      inne: 'Zielone góry, kilometrowe słupki żółto-czarne.',
    },
  },
  {
    id: 'pe', name: 'Peru', region: 'Ameryka Płd.', drive: 'R', domain: '.pe', phone: '+51', diff: 2,
    clues: {
      tablice: 'Białe z niebieskim paskiem u góry i napisem „PERÚ”.',
      jezyk: 'Hiszpański; „PARE”.',
      inne: 'Pustynne wybrzeże, mototaksówki, domy z cegły z niedokończonymi piętrami.',
    },
  },
  {
    id: 'ec', name: 'Ekwador', region: 'Ameryka Płd.', drive: 'R', domain: '.ec', phone: '+593', diff: 3,
    clues: { jezyk: 'Hiszpański; „PARE”.', inne: 'Andy, wulkany, równik.' },
  },
  {
    id: 'uy', name: 'Urugwaj', region: 'Ameryka Płd.', drive: 'R', domain: '.uy', phone: '+598', diff: 3,
    clues: {
      tablice: 'Mercosur: biała z niebieskim paskiem.',
      jezyk: 'Hiszpański; „PARE”.',
      inne: 'Płaskie pastwiska, eukaliptusy.',
    },
  },
  {
    id: 'bo', name: 'Boliwia', region: 'Ameryka Płd.', drive: 'R', domain: '.bo', phone: '+591', diff: 3,
    clues: { jezyk: 'Hiszpański; „PARE”.', inne: 'Altiplano — wysoki, suchy płaskowyż.' },
  },

  // ───────────── AZJA ─────────────
  {
    id: 'jp', name: 'Japonia', region: 'Azja', drive: 'L', domain: '.jp', phone: '+81', diff: 1,
    clues: {
      tablice: 'Małe, prawie kwadratowe; białe (zwykłe) lub żółte (auta kei).',
      slupki: 'Słupy energetyczne z żółto-czarnymi osłonami.',
      jezyk: 'Kanji, hiragana, katakana.',
      inne: 'Lustra drogowe na zakrętach, gęsta sieć kabli, wąskie uliczki.',
    },
  },
  {
    id: 'kr', name: 'Korea Płd.', region: 'Azja', drive: 'R', domain: '.kr', phone: '+82', diff: 2,
    clues: { jezyk: 'Hangul — okrągłe i kwadratowe znaki (ㅇ, ㅁ).', inne: 'Bloki mieszkalne z numerami na ścianach.' },
  },
  {
    id: 'tw', name: 'Tajwan', region: 'Azja', drive: 'R', domain: '.tw', phone: '+886', diff: 2,
    clues: { jezyk: 'Tradycyjne znaki chińskie.', inne: 'Mnóstwo skuterów, gęsta zabudowa, góry.' },
  },
  {
    id: 'th', name: 'Tajlandia', region: 'Azja', drive: 'L', domain: '.th', phone: '+66', diff: 1,
    clues: {
      jezyk: 'Pismo tajskie z pętelkami.',
      inne: 'Słupy z ogromnymi plątaninami kabli, świątynie ze złotymi dachami.',
    },
  },
  {
    id: 'id', name: 'Indonezja', region: 'Azja', drive: 'L', domain: '.id', phone: '+62', diff: 1,
    clues: {
      tablice: 'Czarne z białym tekstem (starsze) lub białe z czarnym (od 2022).',
      jezyk: 'Bahasa: „Jalan” (Jl.), „Gang”.',
      inne: 'Tropiki, skutery, meczety.',
    },
  },
  {
    id: 'my', name: 'Malezja', region: 'Azja', drive: 'L', domain: '.my', phone: '+60', diff: 2,
    clues: {
      tablice: 'Czarne z białym tekstem.',
      jezyk: 'Malajski: „Jalan”, „Kampung”.',
      inne: 'Palmy olejowe, biało-czarne krawężniki.',
    },
  },
  {
    id: 'ph', name: 'Filipiny', region: 'Azja', drive: 'R', domain: '.ph', phone: '+63', diff: 1,
    clues: {
      jezyk: 'Angielski i tagalog.',
      inne: 'Tricycles (motocykle z bocznym wózkiem), jeepneye, kościoły.',
    },
    tips: ['Tropikalna Azja z ruchem PRAWOSTRONNYM i angielskimi napisami = Filipiny.'],
  },
  {
    id: 'in', name: 'Indie', region: 'Azja', drive: 'L', domain: '.in', phone: '+91', diff: 2,
    clues: { jezyk: 'Devanagari (hindi) i wiele innych pism, dużo angielskiego.', inne: 'Riksze, krowy na drodze.' },
  },
  {
    id: 'bd', name: 'Bangladesz', region: 'Azja', drive: 'L', domain: '.bd', phone: '+880', diff: 3,
    clues: { jezyk: 'Pismo bengalskie (pozioma kreska u góry, jak w devanagari).', inne: 'Płasko, pola ryżowe, riksze rowerowe.' },
  },
  {
    id: 'lk', name: 'Sri Lanka', region: 'Azja', drive: 'L', domain: '.lk', phone: '+94', diff: 2,
    clues: {
      jezyk: 'Pismo syngaleskie (okrągłe) i tamilskie.',
      kamera: '„Lowcam” — kamera Gen 4 zamontowana niżej, z okrągłym rozmyciem.',
    },
  },
  {
    id: 'kh', name: 'Kambodża', region: 'Azja', drive: 'R', domain: '.kh', phone: '+855', diff: 2,
    clues: { jezyk: 'Pismo khmerskie.', inne: 'Domy na palach, czerwona ziemia, płasko.' },
  },
  {
    id: 'sg', name: 'Singapur', region: 'Azja', drive: 'L', domain: '.sg', phone: '+65', diff: 2,
    clues: { jezyk: 'Angielski, chiński, malajski, tamilski.', inne: 'Bardzo czysto, wieżowce HDB.' },
  },
  {
    id: 'hk', name: 'Hongkong', region: 'Azja', drive: 'L', domain: '.hk', phone: '+852', diff: 2,
    clues: { jezyk: 'Tradycyjny chiński + angielski.', inne: 'Wieżowce, piętrowe autobusy.' },
  },
  {
    id: 'il', name: 'Izrael', region: 'Azja', drive: 'R', domain: '.il', phone: '+972', diff: 1,
    clues: { jezyk: 'Hebrajski (oraz arabski i angielski na znakach).', inne: 'Krawężniki biało-czerwone i biało-niebieskie.' },
  },
  {
    id: 'ae', name: 'ZEA', region: 'Azja', drive: 'R', domain: '.ae', phone: '+971', diff: 2,
    clues: { jezyk: 'Arabski i angielski.', inne: 'Pustynia, nowoczesne autostrady.' },
  },
  {
    id: 'mn', name: 'Mongolia', region: 'Azja', drive: 'R', domain: '.mn', phone: '+976', diff: 1,
    clues: { jezyk: 'Cyrylica z literami ө i ү.', inne: 'Bezkresne stepy, jurty, często brak asfaltu.' },
  },
  {
    id: 'kg', name: 'Kirgistan', region: 'Azja', drive: 'R', domain: '.kg', phone: '+996', diff: 2,
    clues: {
      jezyk: 'Cyrylica (ң, ө, ү).',
      kamera: 'Widoczny bagażnik dachowy i lusterka samochodu Google.',
      inne: 'Wysokie góry, suche doliny.',
    },
  },
  {
    id: 'kz', name: 'Kazachstan', region: 'Azja', drive: 'R', domain: '.kz', phone: '+7', diff: 2,
    clues: { jezyk: 'Cyrylica z literami ә, ғ, қ, ң, ө, ұ, ү, һ, і.', inne: 'Płaskie stepy.' },
  },
  {
    id: 'bt', name: 'Bhutan', region: 'Azja', drive: 'L', domain: '.bt', phone: '+975', diff: 3,
    clues: { jezyk: 'Pismo dzongkha (tybetańskie).', inne: 'Himalaje, kolorowe zdobione domy, flagi modlitewne.' },
  },
  {
    id: 'np', name: 'Nepal', region: 'Azja', drive: 'L', domain: '.np', phone: '+977', diff: 3,
    clues: { jezyk: 'Devanagari (nepalski).', inne: 'Himalaje, tarasy uprawne.' },
  },
  {
    id: 'jo', name: 'Jordania', region: 'Azja', drive: 'R', domain: '.jo', phone: '+962', diff: 3,
    clues: { jezyk: 'Arabski i angielski.', inne: 'Jasne kamienne domy, pustynia.' },
  },

  // ───────────── AFRYKA ─────────────
  {
    id: 'za', name: 'RPA', region: 'Afryka', drive: 'L', domain: '.za', phone: '+27', diff: 1,
    clues: {
      linie: 'ŻÓŁTE linie krawędziowe, białe środkowe.',
      jezyk: 'Angielski, afrikaans („straat”, „weg”).',
      inne: 'Sawanna, płoty z drutu kolczastego, dużo pokrycia.',
    },
  },
  {
    id: 'ke', name: 'Kenia', region: 'Afryka', drive: 'L', domain: '.ke', phone: '+254', diff: 1,
    clues: {
      kamera: 'SNORKEL — czarna rura przy przedniej części szarego samochodu Gen 4 (nie zawsze widoczna).',
      jezyk: 'Angielski i suahili.',
      inne: 'Czerwona ziemia, sawanna.',
    },
    tips: ['Snorkel = Kenia (najsłynniejsza meta GeoGuessra).'],
  },
  {
    id: 'ug', name: 'Uganda', region: 'Afryka', drive: 'L', domain: '.ug', phone: '+256', diff: 2,
    clues: { jezyk: 'Angielski.', inne: 'Bardzo zielono, czerwona ziemia, boda-body (motocykle-taksówki).' },
  },
  {
    id: 'ng', name: 'Nigeria', region: 'Afryka', drive: 'R', domain: '.ng', phone: '+234', diff: 2,
    clues: { jezyk: 'Angielski.', inne: 'Gęste miasta (Lagos), żółte minibusy.' },
  },
  {
    id: 'gh', name: 'Ghana', region: 'Afryka', drive: 'R', domain: '.gh', phone: '+233', diff: 2,
    clues: {
      jezyk: 'Angielski.',
      kamera: 'W części pokrycia widać samochód jadący za kamerą (follow car).',
      inne: 'Czerwona ziemia, malowane reklamy operatorów komórkowych.',
    },
  },
  {
    id: 'sn', name: 'Senegal', region: 'Afryka', drive: 'R', domain: '.sn', phone: '+221', diff: 2,
    clues: { jezyk: 'Francuski.', inne: 'Sahel: piasek, baobaby, suche krzaki.' },
  },
  {
    id: 'bw', name: 'Botswana', region: 'Afryka', drive: 'L', domain: '.bw', phone: '+267', diff: 2,
    clues: { jezyk: 'Angielski i setswana.', inne: 'Bardzo płaska, sucha sawanna, piaszczyste pobocza.' },
  },
  {
    id: 'sz', name: 'Eswatini', region: 'Afryka', drive: 'L', domain: '.sz', phone: '+268', diff: 3,
    clues: { jezyk: 'Angielski i suazi.', inne: 'Pagórki, plantacje trzciny cukrowej.' },
  },
  {
    id: 'ls', name: 'Lesotho', region: 'Afryka', drive: 'L', domain: '.ls', phone: '+266', diff: 2,
    clues: { jezyk: 'Angielski i sesotho.', inne: 'Wysokie, łyse góry, okrągłe chaty z kamienia.' },
  },
  {
    id: 'tn', name: 'Tunezja', region: 'Afryka', drive: 'R', domain: '.tn', phone: '+216', diff: 2,
    clues: { jezyk: 'Arabski i francuski.', inne: 'Białe domy z niebieskimi drzwiami, gaje oliwne.' },
  },
  {
    id: 'rw', name: 'Rwanda', region: 'Afryka', drive: 'R', domain: '.rw', phone: '+250', diff: 3,
    clues: { jezyk: 'Kinyarwanda, angielski, francuski.', inne: 'Kraj tysiąca wzgórz — zielone, strome zbocza.' },
  },
  {
    id: 'mg', name: 'Madagaskar', region: 'Afryka', drive: 'R', domain: '.mg', phone: '+261', diff: 3,
    clues: { jezyk: 'Malgaski i francuski.', inne: 'Czerwona ziemia, pola ryżowe, domy z cegły.' },
  },

  // ───────────── OCEANIA ─────────────
  {
    id: 'au', name: 'Australia', region: 'Oceania', drive: 'L', domain: '.au', phone: '+61', diff: 1,
    clues: {
      tablice: 'Kolory różne w zależności od stanu.',
      linie: 'Białe linie (środkowe i krawędziowe).',
      znaki: 'Żółte rombowe znaki ostrzegawcze (np. kangury).',
      inne: 'Czerwona ziemia w interiorze, eukaliptusy, szerokie pobocza.',
    },
  },
  {
    id: 'nz', name: 'Nowa Zelandia', region: 'Oceania', drive: 'L', domain: '.nz', phone: '+64', diff: 1,
    clues: {
      linie: 'Białe linie środkowe, żółte linie zakazu wyprzedzania.',
      znaki: 'Żółte rombowe znaki ostrzegawcze.',
      inne: 'Intensywnie zielone pagórki, owce, paprocie drzewiaste.',
    },
  },
];

// Poradniki tematyczne (statyczna treść)
window.GUIDES = [
  {
    id: 'start',
    title: 'Jak grać? Plan na każdą rundę',
    icon: '🧭',
    html: `
      <ol>
        <li><b>Strona ruchu</b> — popatrz na samochody i znaki. Lewa strona zawęża świat do ok. 1/4 krajów.</li>
        <li><b>Pismo</b> — łacinka, cyrylica, alfabet grecki, arabski, azjatyckie? To od razu wybiera region.</li>
        <li><b>Linie na drodze</b> — żółte środkowe = obie Ameryki, Norwegia, Finlandia. Żółte krawędziowe = Irlandia, RPA.</li>
        <li><b>Samochód Google i kamera</b> — snorkel, bagażnik, kolor auta, generacja kamery.</li>
        <li><b>Tablice rejestracyjne</b> — kolor i kształt, nawet gdy nie da się ich przeczytać.</li>
        <li><b>Słupki i znaki</b> — kolor odblasku i tło znaków ostrzegawczych.</li>
        <li><b>Krajobraz</b> — kolor ziemi, roślinność, architektura.</li>
      </ol>
      <p>Zasada: <b>najpierw kontynent, potem kraj, na końcu region</b>. Lepiej pewnie trafić kraj niż zgadywać dokładny punkt.</p>`,
  },
  {
    id: 'stop',
    title: 'Znak STOP: ALTO czy PARE?',
    icon: '🛑',
    html: `
      <p><b>ALTO</b> — Meksyk i Ameryka Środkowa (Gwatemala).</p>
      <p><b>PARE</b> — Ameryka Południowa: Brazylia, Argentyna, Chile, Kolumbia, Peru, Ekwador, Boliwia, Urugwaj.</p>
      <p><b>ARRÊT</b> — Quebec (Kanada).</p>
      <p><b>STOP</b> — większość reszty świata (także Hiszpania).</p>`,
  },
  {
    id: 'kamera',
    title: 'Generacje kamer Google',
    icon: '📷',
    html: `
      <p><b>Gen 1</b> — bardzo niska jakość, stare zdjęcia (praktycznie zniknęła z gry).</p>
      <p><b>Gen 2</b> — rozmyte, „mydlane” kolory, często duży widoczny łuk auta; dawne pokrycie np. Australii, Meksyku, Japonii.</p>
      <p><b>Gen 3</b> — dobra jakość, ale lekko wyblakła; dużo pokrycia z lat 2008–2016 w Europie i Azji.</p>
      <p><b>Gen 4</b> — ostra, nasycona, od ok. 2017 r. Większość nowego pokrycia.</p>
      <p><b>Trekker</b> — kamera noszona na plecach (szlaki, wyspy), widać cień lub kawałek człowieka.</p>
      <p><b>Wskazówki kamery:</b> snorkel (Kenia), bagażnik dachowy (Kirgistan), niska kamera „Lowcam” (Sri Lanka), samochód eskorty (Ghana).</p>`,
  },
  {
    id: 'cyrylica',
    title: 'Cyrylica — rozróżnianie krajów',
    icon: '🔠',
    html: `
      <table>
        <tr><th>Litera</th><th>Kraj</th></tr>
        <tr><td>ы, э</td><td>Rosja (też Białoruś)</td></tr>
        <tr><td>і, ї, є, ґ</td><td>Ukraina</td></tr>
        <tr><td>ъ, щ (częste), brak ы</td><td>Bułgaria</td></tr>
        <tr><td>ђ, ћ, џ, ј</td><td>Serbia (ј także Macedonia Płn.)</td></tr>
        <tr><td>ө, ү</td><td>Mongolia, Kirgistan</td></tr>
        <tr><td>ә, ғ, қ, ұ, һ</td><td>Kazachstan</td></tr>
      </table>`,
  },
  {
    id: 'litery',
    title: 'Łacinka — charakterystyczne litery',
    icon: '🔤',
    html: `
      <table>
        <tr><th>Litery</th><th>Kraj</th></tr>
        <tr><td>ł, ą, ę, ś, ź, ż</td><td>Polska</td></tr>
        <tr><td>ř, ě, ů</td><td>Czechy</td></tr>
        <tr><td>ä, ľ, ĺ, ô, ŕ</td><td>Słowacja</td></tr>
        <tr><td>ő, ű</td><td>Węgry</td></tr>
        <tr><td>ș, ț, ă, î</td><td>Rumunia</td></tr>
        <tr><td>đ, ć</td><td>Chorwacja, Serbia (łacinka)</td></tr>
        <tr><td>č, š, ž bez ć/đ</td><td>Słowenia</td></tr>
        <tr><td>ė, į, ų</td><td>Litwa</td></tr>
        <tr><td>ā, ē, ī, ķ, ļ, ņ</td><td>Łotwa</td></tr>
        <tr><td>õ</td><td>Estonia (też Portugalia: ã, õ)</td></tr>
        <tr><td>æ, ø</td><td>Dania, Norwegia</td></tr>
        <tr><td>å, ä, ö</td><td>Szwecja (Finlandia: ä, ö bez å, podwójne litery)</td></tr>
        <tr><td>ß</td><td>Niemcy, Austria</td></tr>
        <tr><td>ñ</td><td>Hiszpania i Ameryka Łacińska</td></tr>
        <tr><td>ã, ç, „-ão”</td><td>Portugalia, Brazylia</td></tr>
        <tr><td>ğ, ş, ı</td><td>Turcja</td></tr>
      </table>`,
  },
  {
    id: 'zrodla',
    title: 'Zasoby do dalszej nauki',
    icon: '📚',
    html: `
      <ul>
        <li><a href="https://www.plonkit.net/" target="_blank" rel="noopener">Plonk It</a> — najpełniejszy przewodnik po krajach.</li>
        <li><a href="https://geohints.com/" target="_blank" rel="noopener">GeoHints</a> — porównania słupków, tablic, linii, słupów.</li>
        <li><a href="https://geotips.net/" target="_blank" rel="noopener">geotips.net</a> — wskazówki według kontynentów.</li>
        <li><a href="https://learnablemeta.com/" target="_blank" rel="noopener">LearnableMeta</a> — meta do nauki na mapach.</li>
        <li><a href="https://www.geoguessr.com/" target="_blank" rel="noopener">GeoGuessr</a> — przećwicz to w grze!</li>
      </ul>
      <p class="muted">Google co jakiś czas zmienia pokrycie, więc meta się starzeje. Sprawdzaj aktualności na powyższych stronach.</p>`,
  },
];
