const BoxSDK = require('box-node-sdk')
const jsonConfig = require('./related.json')
/**
 * JWT AppClient Singleton.
 * @class
 * @property client - API client.
 * @property sdk - Box SDK.
 *
 */
class AppClient {
    /**
     * Instantiates AppClient singleton.
     */
    constructor() {
        if (! AppClient.instance) {
            this._sdk = BoxSDK.getPreconfiguredInstance(jsonConfig)
            this._client = null
        }
        AppClient.instance = this
        return AppClient.instance
    }

    /**
     * Get an authenticated client, initialize if not.
     *
     * @returns {Object} the authenticated client.
     */
    async getClient() {
        if (this._client == null) {
            return this._sdk.getAppAuthClient('user', '3619260689')
        } else {
            return await this._client
        }
    }

    /**
     * Get an access token (helper for UI Elements)
     *
     * @returns {String} the Access Token.
     */
    async getAccessToken() {
        if (this._client == null) {
            await this.getClient()
        }
        return await this._client._session.getAccessToken()
    }
}

const instance = new AppClient()
export default instance
