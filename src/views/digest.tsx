import type { NightDigest } from '../digest/types.js';

const missing = '—';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'} skipped</p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const marked = row.retries >= 3 || row.hasFailure;
              return (
                <tr class={marked ? 'warn' : undefined}>
                  <td>{row.job || missing}</td>
                  <td>{row.owner ?? missing}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? missing}</td>
                  <td>{row.firstAt || missing}</td>
                  <td>{row.lastAt || missing}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
