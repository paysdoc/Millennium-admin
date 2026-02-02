import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function Pages() {
  return (
    <div>
      <Header />

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

        <Footer />
      </div>
    </div>
  )
}
