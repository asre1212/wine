# Voice entry and tasting-note approval (2.6.0)

Open **+ → microphone**. Tap once to record and again to stop (30-second maximum).
Whisper runs on the device in a worker, using the same implementation as the Lifting
app. Initial setup downloads speech files; **Prepare offline voice** loads them ahead
of time. Review the filled bottle form, then use the existing **Save** button.

Example: “William fever shablis 2022, rating four point seven five, price sixty
dollars. Notes crisp and mineral.” This fills William Fèvre Chablis 2022, White /
Chablis, 4.75, $60, and notes. Vintage stays in the name; it is not confused with
purchase/tasting years. Say “bought in 2024” or “tasted in 2026” for those fields.

**Voice text & teaching** works without a microphone. The dictionary contains 143
common producers, regions, styles and phrases, emphasizing Napa and France, with
accent/phonetic variants. Broad producer names do not imply a grape or style.
Unknown/ambiguous types need review. One bottle per recording; existing draft fields
not mentioned in the transcript remain unchanged.

## Teaching

Under **Teach names & phrases**, enter a misheard phrase/nickname, correct name,
and optionally the wine type/style. **Teach this name correction** prefills these
from a parsed entry and your corrected form. Keep just the recurring name in the
phrase, removing vintage when the mapping should cover future vintages.

Mappings have explicit Edit/Forget/Clear controls, persist locally and take precedence
over the built-in dictionary. They correct recognized text; they do not retrain
Whisper or guarantee pronunciation recognition. Only explicitly remembered short
phrases are stored. JSON backup v5 includes `voiceCorrections`; older backups work.
Restore merges corrections, retaining an existing local mapping on conflicts.
Invalid correction backups are rejected before importing bottles.

## Online tasting notes

**Find tasting notes** searches the public `spawn99/wine-reviews` catalog through
Hugging Face's Dataset Viewer API. It is a historical review dataset, **not a live
whole-web search**; current vintages and some producers will not be available.
Results show full bottle titles. A specified vintage excludes results with a different
or missing vintage. The matcher ranks normalized name terms; it cannot certify a
cuvée from a generic producer name. The user must confirm the bottle and vintage.

For other bottles, **Use a winery / review source** accepts an HTTPS source link.
Jina Reader fetches the page; a matching page title and a distinct tasting-note
section are required for automatic extraction. Sites with access restrictions,
nonstandard headings or reader rate limits may require pasting the tasting paragraph
alongside its source URL. No access restriction is bypassed.

The local summarizer extracts source sensory descriptors into two short lines
(flavors, structure), skipping negated clauses. It does not generate missing facts,
personal ratings, or drinking windows. The suggestion is editable. **Approve into
Notes** requires the explicit match checkbox and appends to existing notes. **Discard**
does nothing to Notes. Only the normal **Save** button logs the bottle.

Approved source title, URL, summary and approval timestamp are retained in
`tastingSources`, shown when reopening the bottle, and included in JSON backup.
Unapproved text is not stored or cached; changed names cancel stale results.
Catalog attribution: Wine Reviews / Zackthoutt, via spawn99 on Hugging Face,
CC BY-NC-SA 4.0 according to the dataset card. Source-derived summaries retain that
attribution; the data is not bundled into the application's code license.

## Privacy and downloads

* Audio stays in memory and is never uploaded or put in localStorage/IndexedDB.
  Closing/backgrounding during recording or processing cancels and releases audio.
* Voice network calls are GET-only model/runtime downloads from Hugging Face and
  jsDelivr. No speech API key, browser/OS speech service, or cloud fallback.
* Online lookup sends the bottle **name** to Hugging Face or a source **URL** to Jina
  only when the respective button is pressed. It does not send audio, personal
  notes, ratings or the collection. Providers receive normal request metadata.
* Built-in parsing, correction memory and pasted-note condensation work offline.
  Downloaded model caches can be evicted by the browser; online setup may be needed
  again. App updates preserve model cache and local data.

Dependencies: vendored Transformers.js 3.8.1 (Apache-2.0, included license),
`Xenova/whisper-tiny.en` q8 revision `79fb389fc764e7c395bd330e9531d9d32ada7049`.
WASM CPU, single thread. Optional online lookup requires no key.

## Validation

`npm install` then `npm test` runs parser, dictionary, memory, backup, privacy and
DOM integration checks. UI tests mock microphone/Whisper and online responses to
verify controls and approval behavior. They do not measure transcription accuracy
or prove live third-party availability. Physical iPhone microphone, performance and
offline model use still need device validation.

Reviewed references:

- Lifting implementation: https://github.com/asre1212/Lifting/blob/main/VOICE.md
- Transformers.js: https://huggingface.co/docs/transformers.js/en/index
- Dataset API: https://huggingface.co/docs/dataset-viewer/en/search
- Catalog/provenance: https://huggingface.co/datasets/spawn99/wine-reviews/blob/main/README.md
- Reader service: https://jina.ai/reader/
- Promontory spelling/location: https://www.promontory.wine/visit/
- William Fèvre: https://www.lafite.com/fr/domaines/william-fevre/
