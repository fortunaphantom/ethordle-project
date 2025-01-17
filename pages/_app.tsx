import '../styles/global.css';
import '../styles/tokens.css';
import '../styles/toggle.css';
import '../styles/button.css';

import { CryptoProvider } from '../context/useCrypto';

function Ethordle({ Component, pageProps }) {
   return (
      <CryptoProvider>
       <Component {...pageProps} />
      </CryptoProvider>
   )
}

export default Ethordle