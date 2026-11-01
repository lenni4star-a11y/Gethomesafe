import { Modal } from './Modal';

interface Props {
  onClose: () => void;
  onDeleteAll?: () => void;
}

/** Datenschutz in einfacher Sprache */
export function PrivacyPage({ onClose, onDeleteAll }: Props) {
  return (
    <Modal title="Datenschutz" onClose={onClose}>
      <div className="privacy">
        <p>
          <b>Kurz gesagt:</b> Gethomesafe hat keinen eigenen Server und keine Accounts. Alles, was du eingibst, bleibt auf deinem Handy.
        </p>

        <h3>Was auf deinem Handy gespeichert wird</h3>
        <ul>
          <li>Einstellungen (z. B. Parks meiden, Stimme, Begleitmodus)</li>
          <li>Zuhause und Lieblingsorte</li>
          <li>Notfallkontakte (Name und Telefonnummer)</li>
          <li>Deine Bewertungen</li>
          <li>
            Während einer Begleitung: Ziel, geplante Route, PIN (nur als unlesbarer Prüfwert) und <b>nur deine letzte Position</b>. Beim Beenden wird das alles
            gelöscht. Es gibt keinen Verlauf deiner Wege.
          </li>
        </ul>
        <p className="muted">Gespeichert wird im Browser-Speicher (IndexedDB) dieser Webseite. Andere Webseiten können darauf nicht zugreifen.</p>

        <h3>Wann dein Standort verwendet wird</h3>
        <ul>
          <li>Wenn du auf ◎ tippst (Start = mein Standort) – einmalig, nicht gespeichert.</li>
          <li>Während einer Begleitung – nur die letzte Position wird gespeichert und beim Ende gelöscht.</li>
          <li>Wenn du im SOS-Menü eine Nachricht vorbereitest – einmalig für diese Nachricht.</li>
        </ul>

        <h3>Welche Dienste die App aufruft</h3>
        <ul>
          <li>
            <b>GitHub Pages</b> (USA): liefert die App aus. Dabei wird wie bei jeder Webseite deine IP-Adresse verarbeitet.
          </li>
          <li>
            <b>OpenFreeMap</b>: Kartenbilder. Übertragen wird, welchen Kartenausschnitt du ansiehst.
          </li>
          <li>
            <b>Photon von komoot</b> (Deutschland): Adresssuche. Übertragen wird, was du ins Suchfeld tippst. Haltestellen sucht die App ohne diesen Dienst.
          </li>
          <li>
            <b>Mapillary</b> (gehört zu Meta): Straßenfotos. Übertragen wird der Bereich rund um die Route bzw. die Stelle, die du ansiehst.
          </li>
          <li>
            <b>Spracherkennung</b> (nur wenn du im Anruf mit „gut“ / „nicht gut“ antwortest): In Chrome wird die Aufnahme dafür an Google geschickt. Die Knöpfe
            funktionieren ohne.
          </li>
        </ul>
        <p className="muted">Deine Heimadresse, Kontakte und Bewertungen werden an keinen dieser Dienste geschickt.</p>

        <h3>Was an deine Notfallkontakte geht</h3>
        <p>
          Nur wenn du es auslöst: eine vorbereitete SMS oder WhatsApp mit deinem <b>aktuellen Standort</b> (Link zur Karte). Nie deine Heimadresse. Absenden musst
          du selbst – die App verschickt nichts heimlich. Bei WhatsApp gelten die Regeln von WhatsApp.
        </p>

        <h3>Wie du alles löschst</h3>
        <ul>
          <li>Einzeln: Zuhause, Kontakte und Bewertungen lassen sich in der App löschen.</li>
          <li>Alles auf einmal: ⚙ Einstellungen → „Alle meine Daten löschen“.</li>
          <li>Oder: In den Browser-Einstellungen die Website-Daten von lenni4star-a11y.github.io löschen.</li>
        </ul>
        {onDeleteAll && (
          <button type="button" className="btn danger" onClick={onDeleteAll}>
            Alle meine Daten löschen
          </button>
        )}

        <h3>Datenquellen</h3>
        <p className="muted">
          Kartendaten © OpenStreetMap-Mitwirkende (ODbL). Stadt Wien – data.wien.gv.at (CC BY 4.0). Öffi-Fahrplan: Wiener Linien Open Data (CC BY 4.0), in der App gespeichert – für Öffi-Vorschläge wird kein Dienst aufgerufen. Straßenfotos © Mapillary-Mitwirkende (CC BY-SA 4.0).
        </p>
        <p className="fineprint">Prototyp, Stand November 2026. Fragen und Hinweise bitte an die Projektverantwortlichen.</p>
      </div>
    </Modal>
  );
}
