/**
 * @fileOverview the info actions are used to fetch general details about the
 * state of the lnd such as the public key as well as synchronization state and
 * the current block height.
 */

import { observe } from 'mobx';
import { poll } from '../helper';
import * as log from './log';

class InfoAction {
  constructor(store, grpc, nav, notification) {
    this._store = store;
    this._nav = nav;
    this._grpc = grpc;
    this._notification = notification;
  }

  /**
   * Fetches the current details of the lnd node and sets the corresponding
   * store parameters. This api is polled at the beginning of app initialization
   * until lnd has finished syncing the chain to the connected bitcoin full node.
   * @return {Promise<undefined>}
   */
  async getInfo() {
    try {
      const response = await this._grpc.sendCommand('getInfo');
      this._store.pubKey = response.identityPubkey;
      this._store.syncedToChain = response.syncedToChain;
      this._store.blockHeight = response.blockHeight;
      this._store.network = response.chains[0].network;
      if (this.startingSyncTimestamp === undefined) {
        this.startingSyncTimestamp = response.bestHeaderTimestamp || 0;
      }
      if (!response.syncedToChain) {
        this._notification.display({
          msg: `Syncing to chain (block: ${response.blockHeight})`,
          wait: true,
        });
        this._store.percentSynced = this.calcPercentSynced(response);
      } else {
        this._store.settings.restoring = false;
        this._notification.display({
          type: 'success',
          msg: 'Syncing complete',
        });
      }
      return response.syncedToChain;
    } catch (err) {
      log.error('Getting node info failed', err);
    }
  }

  /**
   * Poll the getInfo api until syncedToChain is true.
   * @return {Promise<undefined>}
   */
  async pollInfo() {
    await poll(() => this.getInfo());
  }

  /**
   * A navigation helper called during the app onboarding process. The loader
   * screen indicating the syncing progress in displayed until syncing has
   * completed `syncedToChain` is set to true. After that the user is taken
   * to the home screen.
   * @return {undefined}
   */
  initLoaderSyncing() {
    if (this._store.syncedToChain) {
      this._nav.goHome();
    } else {
      this._nav.goLoaderSyncing();
      observe(this._store, 'syncedToChain', () => this._nav.goHome());
    }
  }

  /**
   * An internal helper function to approximate the current progress while
   * syncing Neutrino to the full node.
   * @param  {Object} response The getInfo's grpc api response
   * @return {number}          The percrentage a number between 0 and 1
   */
  calcPercentSynced(response) {
    const bestHeaderTimestamp = response.bestHeaderTimestamp;
    const currTimestamp = new Date().getTime() / 1000;
    const progressSoFar = bestHeaderTimestamp
      ? bestHeaderTimestamp - this.startingSyncTimestamp
      : 0;
    const totalProgress = currTimestamp - this.startingSyncTimestamp || 0.001;
    const percentSynced = (progressSoFar * 1.0) / totalProgress;
    return percentSynced;
  }
}

export default InfoAction;
