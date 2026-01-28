import Link from 'next/link'

export default function Users() {
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
          <h1 className="page-title">Users</h1>
          <p>Manage users here.</p>

          <div style={{ marginTop: '20px' }}>
            <Link href="/users/new" className="button">
              Create New User
            </Link>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>admin</td>
                <td>admin@example.com</td>
                <td>Administrator</td>
                <td>
                  <Link href="/users/1" className="button button-secondary">
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


