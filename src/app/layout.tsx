import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Graventum Inbox',
  description: 'Portal de conversas WhatsApp - time Graventum',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const urlParams = new URLSearchParams(window.location.search);
                  const embedKey = urlParams.get('embed_key');
                  if (embedKey) {
                    sessionStorage.setItem('inbox_embed_key', embedKey);
                  }
                  
                  const originalFetch = window.fetch;
                  window.fetch = function(input, init) {
                    try {
                      const storedKey = sessionStorage.getItem('inbox_embed_key');
                      if (storedKey) {
                        let url = '';
                        if (typeof input === 'string') {
                          url = input;
                        } else if (input instanceof URL) {
                          url = input.href;
                        } else if (input && typeof input === 'object' && 'url' in input) {
                          url = (input as any).url;
                        }

                        const isLocal = url && (
                          url.startsWith('/') || 
                          url.startsWith(window.location.origin) || 
                          !/^https?:/i.test(url)
                        );

                        if (isLocal) {
                          init = init || {};
                          init.headers = init.headers || {};
                          if (init.headers instanceof Headers) {
                            init.headers.set('x-embed-key', storedKey);
                          } else if (Array.isArray(init.headers)) {
                            init.headers.push(['x-embed-key', storedKey]);
                          } else {
                            (init.headers as any)['x-embed-key'] = storedKey;
                          }
                        }
                      }
                    } catch (e) {
                      console.error('Error in intercepted fetch:', e);
                    }
                    return originalFetch(input, init);
                  };
                } catch (e) {
                  console.error('Error in fetch interceptor setup:', e);
                }
              })();
            `
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
