import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function Users() {
  return (
    <div>
      <Header />

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

        <Footer />
      </div>
    </div>
  )
}
