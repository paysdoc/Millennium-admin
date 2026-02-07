import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function Settings() {
  return (
    <div>
      <Header />

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

        <Footer />
      </div>
    </div>
  )
}
