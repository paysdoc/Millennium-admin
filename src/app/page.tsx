import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <header className="header">
        <div className="container">
          <div className="header-content">
            <Link href="/" className="logo">
              Millennium Admin
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
          <h1 className="page-title">Welcome to Millennium Admin</h1>
          <p>
            This is your admin interface built with Next.js in a Wikipedia-style
            design.
          </p>

          <h2>Quick Links</h2>
          <ul>
            <li>
              <Link href="/pages">Manage Pages</Link>
            </li>
            <li>
              <Link href="/users">Manage Users</Link>
            </li>
            <li>
              <Link href="/settings">Settings</Link>
            </li>
          </ul>
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


