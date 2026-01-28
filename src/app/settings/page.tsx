import Link from 'next/link'

export default function Settings() {
  return (
    <div>
      <header className="header">
        <div className="container">
          <div className="header-content">
            <Link href="/" className="logo">
              Millennium Characters
            </Link>
            <nav>
              <ul className="nav-links">
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li>
                  <Link href="/pages">Pages</Link>
                </li>
                <li>
                  <Link href="/users">Users</Link>
                </li>
                <li>
                  <Link href="/settings">Settings</Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>

      <div className="container">
        <main className="main-content">
          <h1 className="page-title">Settings</h1>
          <p>Configure your admin settings here.</p>

          <form style={{ marginTop: '20px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="site-name">
                Site Name
              </label>
              <input
                type="text"
                id="site-name"
                className="form-input"
                defaultValue="Millennium Admin"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="site-description">
                Site Description
              </label>
              <textarea
                id="site-description"
                className="form-textarea"
                defaultValue="Admin interface for Millennium"
              />
            </div>

            <div className="form-group">
              <button type="submit" className="button">
                Save Settings
              </button>
            </div>
          </form>
        </main>

        <footer className="footer">
          <div className="container">
            <p>Millennium Admin &copy; {new Date().getFullYear()}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}


