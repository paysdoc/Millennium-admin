import Link from 'next/link'

export default function Pages() {
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
          <h1 className="page-title">Pages</h1>
          <p>Manage your pages here.</p>

          <div style={{ marginTop: '20px' }}>
            <Link href="/pages/new" className="button">
              Create New Page
            </Link>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Last Modified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sample Page</td>
                <td>2024-01-01</td>
                <td>
                  <Link href="/pages/1" className="button button-secondary">
                    Edit
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
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


