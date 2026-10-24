import { useEffect, useState } from 'react';
import { Library } from './Library';
import { Report } from './Report';

const parseRoute = () => {
  const m = /^#\/report\/(.+)$/.exec(location.hash);
  return m ? { page: 'report' as const, id: decodeURIComponent(m[1]) } : { page: 'library' as const };
};

export function App() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (route.page === 'library') document.title = 'EngageLens';
  }, [route]);

  return (
    <div className="app">
      <header className="topbar no-print">
        <a href="#/" className="brand">
          <img src="/icon/48.png" alt="" width={24} height={24} />
          <span>EngageLens</span>
          <span className="muted brand-sub">Chat Analytics for Google Meet</span>
        </a>
        <span className="badge privacy" title="Chats are analysed and stored only in this browser">🔒 On-device</span>
      </header>
      <main>{route.page === 'report' ? <Report meetingId={route.id} /> : <Library />}</main>
    </div>
  );
}
