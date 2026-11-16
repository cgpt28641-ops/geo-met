// Poradniki. Część jest generowana z bazy krajów (window.GM ustawiane w app.js).
// Źródła: Plonk It, Geometas, GeoHints (generacje kamer, linie, follow cars), blog „GeoGuessr – The Top Tips, Tricks and Techniques”.
window.buildGuides = function () {
  const { C, byId, flag, esc } = window.GM;
  const names = s => s.split(',').map(x => x.trim()).filter(Boolean);
  // lista flag z kodów ISO (tylko kraje z bazy są klikalne)
  const fl = codes => `<div class="flaglist">${codes.map(id => byId[id]
    ? `<a href="#kraj/${id}">${flag(id, 'sm')}${esc(byId[id].name)}</a>`
    : `<span>${flag(id, 'sm')}${esc(id.toUpperCase())}</span>`).join('')}</div>`;
  const where = (cat, re) => C.filter(c => (c.clues[cat] || []).some(v => re.test(v))).map(c => c.id);

  return [
    {
      id: 'plan', icon: '🧭', title: 'Plan na każdą rundę', sub: 'Od czego zacząć, gdy pojawiasz się na mapie',
      html: `
        <ol>
          <li><b>Obróć się o 360°.</b> Najlepsza wskazówka często stoi za tobą.</li>
          <li><b>Strona ruchu</b> — samochody, znaki, słupki. Lewostronny ruch od razu zawęża świat do ok. ¼ krajów.</li>
          <li><b>Pismo i język</b> — łacinka, cyrylica, greka, arabski, alfabety azjatyckie? Charakterystyczne litery (ł, ř, ő, ș…) wskazują jeden kraj.</li>
          <li><b>Spójrz w dół — samochód Google.</b> Kolor auta, antena, bagażnik, snorkel, generacja kamery i kształt rozmycia.</li>
          <li><b>Linie na drodze</b> — żółta linia środkowa = obie Ameryki, Norwegia, Finlandia i część Azji; żółte krawędzie = m.in. Irlandia, RPA, Hiszpania.</li>
          <li><b>Tablice, słupki, znaki, słupy</b> — kolor i kształt wystarczą, nawet jeśli nic nie da się przeczytać.</li>
          <li><b>Krajobraz</b> — kolor ziemi, roślinność, góry, architektura, zamożność.</li>
        </ol>
        <p><b>Zasada:</b> najpierw kontynent → kraj → region → dokładne miejsce. Lepiej pewnie trafić kraj niż ryzykować punkt na drugim końcu świata.</p>
        <h4>Gdy się wahasz</h4>
        <ul>
          <li>Typuj kraje z dużym pokryciem — Rosja, USA, Brazylia, Argentyna, Australia, Kanada i Europa pojawiają się najczęściej. Rzadkie kraje (np. Eswatini) wybieraj tylko przy mocnych dowodach.</li>
          <li>Wypisz w głowie 2–3 kandydatów i sprawdzaj każdego wskazówka po wskazówce.</li>
          <li>W rundach na czas postaw najpierw „bezpieczny” pin w środku regionu, a dopiero potem doprecyzowuj.</li>
          <li>Po każdej rundzie obejrzyj prawdziwe miejsce i zapytaj się: co przeoczyłem?</li>
        </ul>`,
    },
    {
      id: 'slonce', icon: '☀️', title: 'Słońce, cienie i anteny satelitarne', sub: 'Półkula bez czytania ani jednego znaku',
      html: `
        <ul>
          <li><b>Słońce na południu</b> → najpewniej półkula północna. <b>Słońce na północy</b> → półkula południowa. Im niżej słońce nad horyzontem, tym pewniejsza ta wskazówka.</li>
          <li><b>Cienie</b> działają odwrotnie: cień skierowany na północ = półkula północna, na południe = południowa.</li>
          <li>Słońce prawie w zenicie i krótkie cienie → okolice zwrotników / równika.</li>
          <li>Gdy słońca nie widać, sprawdź, która strona wzgórz lub budynków jest oświetlona.</li>
          <li><b>Anteny satelitarne</b> celują w satelity nad równikiem: skierowane na południe = półkula północna, na północ = południowa. Im bardziej „patrzą w górę”, tym bliżej równika.</li>
          <li>Kompas w grze: czerwony koniec zawsze wskazuje północ.</li>
        </ul>`,
    },
    {
      id: 'ruch', icon: '🚶', title: 'Poruszanie się i czytanie mapy', sub: 'Jak szybko znaleźć dokładne miejsce',
      html: `
        <ul>
          <li>Idź <b>w dół zbocza</b>, w stronę miast, głównych dróg i skrzyżowań — tam są znaki. Ślady opon i polne drogi prowadzą do cywilizacji.</li>
          <li><b>Znaki z odległościami:</b> znajdź obie miejscowości na mapie, ustal kierunek drogi i postaw pin w odpowiednim stosunku odległości.</li>
          <li><b>Słupki kilometrowe:</b> malejące liczby = jedziesz w stronę końca/granicy drogi; „0” = początek drogi lub granica regionu.</li>
          <li>Na pustkowiach (Patagonia, Mongolia, Botswana, australijski interior) ustaw się przodem do drogi, sprawdź kompas i dopasuj kształt i kierunek drogi do mapy.</li>
          <li>Porównuj <b>kolor roślinności</b> z mapą: na małym przybliżeniu ciemna zieleń vs. suche, żółtawe tereny są dobrze widoczne.</li>
          <li>Zapamiętuj trasę i ustawiaj punkty kontrolne przed ślepymi uliczkami — łatwo wrócisz do przegapionego znaku.</li>
          <li>Nazwy miast na mapie oznaczają ich centrum. Gdy nie znasz nazwy, szukaj największej miejscowości z tablicy.</li>
          <li>Mile na znakach → USA lub Wielka Brytania; reszta świata używa kilometrów (pomaga odróżnić Kanadę od USA).</li>
        </ul>`,
    },
    {
      id: 'tryby', icon: '⚔️', title: 'Taktyka w trybach rywalizacji', sub: 'Pojedynki i Battle Royale',
      html: `
        <h4>Pojedynki (Duels)</h4>
        <ul>
          <li>Gdy widzisz pewną wskazówkę (np. polski słupek), zgaduj szybko — rywal dostaje tylko 15 s.</li>
          <li>Jeśli rywal zgadł pierwszy, postaw pin, ale nie zatwierdzaj — zablokuje się sam, a ty dalej szukasz.</li>
          <li>Czytelny znak niedaleko? Podejdź do niego zamiast strzelać w ciemno. Nie trać jednak czasu na pogoń za idealnym wynikiem.</li>
          <li>Od 5. rundy obrażenia rosną (×1,5 i więcej) — późne rundy ważą najwięcej.</li>
        </ul>
        <h4>Battle Royale — kraje</h4>
        <ul>
          <li>Wyeliminowane kraje widać w rogu ekranu — skreśl je.</li>
          <li>Na początku daj innym zgadnąć; przy 2–3 kandydatach zgaduj od razu. 50/50 używaj dopiero po dwóch pomyłkach.</li>
        </ul>
        <h4>Battle Royale — odległość</h4>
        <ul>
          <li>Pierwszy strzał oddawaj w drugiej połowie czasu, po rozejrzeniu się.</li>
          <li>Obserwuj dystans do graczy obok w tabeli — jeśli maleje, idziesz w dobrą stronę.</li>
          <li>Stolice pojawiają się często — przy braku wskazówek to rozsądny wybór.</li>
        </ul>`,
    },
    {
      id: 'kamery', icon: '📷', title: 'Generacje kamer Google', sub: 'Jak je rozpoznać i gdzie występują',
      html: `
        <table>
          <tr><th>Kamera</th><th>Jak rozpoznać</th></tr>
          <tr><td><b>Gen 1</b></td><td>Bardzo niska rozdzielczość. Tylko USA, Kanada, Meksyk, Australia, NZ, Japonia, Francja, Włochy, Monako.</td></tr>
          <tr><td><b>Gen 2</b></td><td>Rozmyte koło u góry i u dołu obrazu, „mydlane” kolory, aureola wokół słońca.</td></tr>
          <tr><td><b>Gen 3</b></td><td>Dobra jakość, brak koła na niebie, rozmycie w kształcie auta na dole. Najczęstsza na świecie.</td></tr>
          <tr><td><b>Gen 4</b></td><td>Najostrzejsza, żywe kolory; rozmycie auta na dole często ma niebieskawy odcień.</td></tr>
          <tr><td><b>Bad Cam</b></td><td>Gorsza niż Gen 3, duże rozmycie na dole, prześwietlone niebo. Typowa dla Indii, Nepalu, Bangladeszu, części Kambodży i Ekwadoru (też fragmenty Europy).</td></tr>
          <tr><td><b>Low Cam</b></td><td>Kamera zamontowana nisko (prywatność), większe rozmycie auta, bez koła u góry.</td></tr>
          <tr><td><b>Small Cam</b></td><td>Jakość jak Gen 4, ale rozmycie auta większe i bardziej okrągłe, z małym „noskiem” z przodu.</td></tr>
          <tr><td><b>Trekker</b></td><td>Kamera na plecach — małe rozmycie „w kształcie człowieka”. Szlaki, wyspy, parki.</td></tr>
        </table>
        <h4>Low Cam — tylko 4 kraje</h4>${fl(['jp', 'li', 'lk', 'ch'])}
        <h4>Gen 1 — wyłącznie</h4>${fl(['us', 'ca', 'mx', 'au', 'nz', 'jp', 'fr', 'it', 'mc'])}
        <h4>Gen 4 w Ameryce Łacińskiej</h4><p>Najczęściej Meksyk, Brazylia, Argentyna, Chile, Kolumbia, Peru, Urugwaj, Ekwador, Kostaryka, Panama.</p>`,
    },
    {
      id: 'auto', icon: '🚙', title: 'Ściąga: samochód Google', sub: 'Snorkel, bagażnik, antena, eskorta — wygenerowane z bazy',
      html: (() => {
        const s = where('kamera', /snorkel/i), r = where('kamera', /bagażnik/i), a = where('kamera', /(długa|długą|wysoka|wysoką) anten/i), f = where('kamera', /eskort|follow|jadący za|za samochodem Google/i);
        return `<p>Spójrz w dół i obróć kamerę — samochód Google to jedna z najszybszych wskazówek.</p>
          <h4>🤿 Snorkel (rura wlotu powietrza)</h4>${fl(s)}
          <h4>🧳 Widoczny bagażnik dachowy</h4>${fl(r)}
          ${a.length ? `<h4>📡 Długa / wysoka antena</h4>${fl(a)}` : ''}
          ${f.length ? `<h4>🚓 Samochód eskorty (follow car)</h4>${fl(f)}` : ''}
          <p class="muted small">Szczegóły (kolory aut, rozmycia, generacje) znajdziesz w zakładce Porównaj → Kamera.</p>`;
      })(),
    },
    {
      id: 'lewy', icon: '⬅️', title: 'Ruch lewostronny — pełna lista', sub: 'Generowana z bazy krajów',
      html: `<p>Patrz na zaparkowane i jadące auta, stronę, po której stoją znaki, oraz lusterka samochodu Google. Lewostronny ruch mają głównie dawne kolonie brytyjskie i kraje wyspiarskie (wyjątki: Filipiny, Islandia jeżdżą po prawej).</p>
        ${fl(C.filter(c => c.drive === 'L').map(c => c.id))}`,
    },
    {
      id: 'linie', icon: '🛣️', title: 'Kolory linii na drodze', sub: 'Na podstawie zestawienia GeoHints',
      html: `
        <h4>Żółta linia środkowa (biała krawędź)</h4>
        <p>Obie Ameryki (USA, Kanada, Meksyk, Gwatemala, Kostaryka, Panama, Dominikana, Portoryko, Kolumbia, Ekwador, Peru, Boliwia, Brazylia, Argentyna, Chile*, Paragwaj), Norwegia, Finlandia*, Grecja*, Hiszpania*, Albania*, Austria*, Turcja*, Rosja*, Japonia*, Korea Płd., Tajwan, Tajlandia, Kambodża, Filipiny, Indonezja*, Wietnam, Kenia, Uganda, Rwanda, Tunezja, Liban, Katar, Nowa Zelandia*.</p>
        <h4>Żółte linie krawędziowe (biała środkowa)</h4>
        <p>Wielka Brytania, Irlandia, Wyspa Man, Jersey, Gibraltar, Francja*, Hiszpania, Portugalia, Szwajcaria, Węgry, Litwa, Czarnogóra, Turcja, Rosja, Izrael, Jordania, ZEA, Oman, Indie, Nepal, Sri Lanka, Malezja, Singapur, Kazachstan, Meksyk*, Chile, RPA, Namibia, Botswana, Eswatini, Lesotho, Nigeria, Australia, Nowa Zelandia.</p>
        <h4>Wszystkie linie żółte</h4>
        <p>Australia (części), Brazylia, Chile, Indie, Indonezja, Nowa Zelandia, Macedonia Płn., Oman, Rumunia, Korea Płd., Tajwan, Turcja, ZEA.</p>
        <h4>Nietypowe</h4>
        <ul>
          <li>Czerwone krawędzie: RPA, Namibia, Wielka Brytania; czerwone krawędzie + żółty środek: Tajwan.</li>
          <li>Niebieskie linie: Filipiny, Brazylia, Tajwan, Hiszpania (strefy parkowania).</li>
          <li>Zielone elementy: Holandia.</li>
        </ul>
        <p class="muted small">* tylko na części dróg lub obok innego wariantu. Szczegóły w karcie kraju.</p>`,
    },
    {
      id: 'stop', icon: '🛑', title: 'Znak STOP: ALTO, PARE czy ARRÊT?', sub: 'Szybkie rozróżnienie w Amerykach',
      html: `
        <table>
          <tr><th>Napis</th><th>Gdzie</th></tr>
          <tr><td><b>ALTO</b></td><td>Meksyk i Ameryka Środkowa (Gwatemala, Panama, Dominikana)</td></tr>
          <tr><td><b>PARE</b></td><td>Ameryka Płd.: Brazylia, Argentyna, Chile, Kolumbia, Peru, Ekwador, Boliwia, Urugwaj</td></tr>
          <tr><td><b>ARRÊT</b></td><td>Quebec (Kanada)</td></tr>
          <tr><td><b>STOP</b></td><td>Większość reszty świata, w tym Hiszpania i Portoryko</td></tr>
        </table>`,
    },
    {
      id: 'cyrylica', icon: '🔠', title: 'Cyrylica — który kraj?', sub: 'Litery, które zdradzają kraj',
      html: `
        <table>
          <tr><th>Litery</th><th>Kraj</th></tr>
          <tr><td>ы, э</td><td>Rosja, Białoruś (Białoruś ma też і i ў)</td></tr>
          <tr><td>і, ї, є, ґ</td><td>Ukraina</td></tr>
          <tr><td>ъ i щ (częste), brak ы, э</td><td>Bułgaria</td></tr>
          <tr><td>ђ, ћ, џ, љ, њ, ј</td><td>Serbia (ј, љ, њ, џ też Macedonia Płn. i Czarnogóra)</td></tr>
          <tr><td>ѓ, ќ, ѕ</td><td>Macedonia Płn.</td></tr>
          <tr><td>ө, ү</td><td>Mongolia, Kirgistan (Kirgistan też ң)</td></tr>
          <tr><td>ә, ғ, қ, ұ, һ, і</td><td>Kazachstan</td></tr>
        </table>`,
    },
    {
      id: 'lacinka', icon: '🔤', title: 'Łacinka — charakterystyczne litery', sub: 'Europa i świat',
      html: `
        <table>
          <tr><th>Litery</th><th>Kraj</th></tr>
          <tr><td>ł, ń, ż, ś, ź, ą, ę</td><td>Polska</td></tr>
          <tr><td>ř, ě, ů</td><td>Czechy</td></tr>
          <tr><td>ä, ľ, ĺ, ô, ŕ</td><td>Słowacja</td></tr>
          <tr><td>ő, ű</td><td>Węgry</td></tr>
          <tr><td>ș, ț, ă, â, î</td><td>Rumunia</td></tr>
          <tr><td>đ, ć</td><td>Chorwacja, Serbia, Czarnogóra (łacinka)</td></tr>
          <tr><td>č, š, ž bez ć/đ</td><td>Słowenia</td></tr>
          <tr><td>ë, ç</td><td>Albania</td></tr>
          <tr><td>ė, į, ų, ū</td><td>Litwa</td></tr>
          <tr><td>ā, ē, ī, ķ, ļ, ņ, ģ</td><td>Łotwa</td></tr>
          <tr><td>õ, ä, ö, ü</td><td>Estonia</td></tr>
          <tr><td>æ, ø, å</td><td>Dania, Norwegia (Wyspy Owcze też ð)</td></tr>
          <tr><td>å, ä, ö</td><td>Szwecja; Finlandia: ä, ö i mnóstwo podwójnych liter</td></tr>
          <tr><td>þ, ð</td><td>Islandia</td></tr>
          <tr><td>ß</td><td>Niemcy, Austria (w Szwajcarii nie używa się)</td></tr>
          <tr><td>ğ, ş, ı, İ</td><td>Turcja</td></tr>
          <tr><td>ñ</td><td>Hiszpański — Hiszpania i Ameryka Łacińska</td></tr>
          <tr><td>ã, õ, ç, „-ção”</td><td>Portugalia, Brazylia</td></tr>
          <tr><td>ħ, ġ, ż, għ</td><td>Malta</td></tr>
          <tr><td>ơ, ư, ạ, ế (dużo akcentów)</td><td>Wietnam</td></tr>
        </table>`,
    },
    {
      id: 'zrodla', icon: '📚', title: 'Źródła i dalsza nauka', sub: 'Skąd pochodzi ta wiedza',
      html: `
        <ul>
          <li><a href="https://www.plonkit.net/guide" target="_blank" rel="noopener">Plonk It</a> — najpełniejszy przewodnik krok po kroku (kraj → region → szczegóły). Główne źródło kart krajów.</li>
          <li><a href="https://geometas.com/" target="_blank" rel="noopener">Geometas</a> — meta pogrupowane wg krajów i kategorii, z quizami.</li>
          <li><a href="https://geohints.com/" target="_blank" rel="noopener">GeoHints</a> — galerie porównawcze: słupki, tablice, linie, słupy, kamery, samochody eskorty.</li>
          <li><a href="https://somerandomstuff1.wordpress.com/2019/02/08/geoguessr-the-top-tips-tricks-and-techniques/" target="_blank" rel="noopener">GeoGuessr – The Top Tips, Tricks and Techniques</a> — strategia, słońce, poruszanie się, tryby gry.</li>
        </ul>
        <p class="muted small">Treści opracowano po polsku własnymi słowami. Google regularnie dodaje nowe pokrycie, więc część mety się starzeje — w razie wątpliwości sprawdzaj źródło.</p>`,
    },
  ];
};
