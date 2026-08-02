import index from '../../data/index.json';

// Republishes the generated catalog index as a stable, public JSON API.
export function GET() {
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
