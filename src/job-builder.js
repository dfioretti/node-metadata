import JobItem from './job-item';
const Store = require('electron-store');
const config = new Store();
import Constants from '../utils/constants';
import Job from './job';
const _ = require('underscore');

/**
 * JobBuilder static class helper wrapper for queueing new activeJob items.
 *
 * Should be updated as an abstract interface for activeJob execution that can
 * apply to any kind of activeJob, decoupled with the specific implementation.
 *
 * TODO: Need to the update callback for UI notifications.
 * TODO: Handle case for metadata template already exists (create fails).
 */
class JobBuilder {

    /**
     * Get the active job to operate on.
     * @returns {Promise<*>}
     */
    static async getActiveJob() {
        const activeJobId = config.get(Constants.ACTIVE_JOB);
        return await Job.getJob({ _id: activeJobId });
    }

    /**
     * Fetches the active job items from Box and put into data store.
     *
     * @param client - the Box API client.
     * @param done - the finished callback.
     * @param update - the UI update callback.
     */
    static async loadActiveJobItems(client, done, update) {
        const activeJob = await JobBuilder.getActiveJob();
        await JobItem.removeJobItems({ jobId: activeJob._id });
        await JobBuilder.addFolderItemsToJob([activeJob.parentFolderId], activeJob.name, activeJob.parentFolderId, client, done, update);
    }

    /**
     * Fetches the active job items from Box and put into data store.
     *
     * @param client - the Box API client.
     * @param done - the finished callback.
     * @param update - the UI update callback.
     */
    static async loadActiveFolderJobItems(client, done, update) {
        const activeJob = await JobBuilder.getActiveJob();
        await JobItem.removeJobItems({ jobId: activeJob._id });
        await JobBuilder.addFoldersToJob([activeJob.parentFolderId], activeJob.name, activeJob.parentFolderId, client, done, update);
    }

    /**
     * Recursively traverse a folder system and add enqueue all
     * files as new JobItems.
     *
     * TODO: need to test at scale - purely async may fail by exceeding stack, may need recursion to be synchronous.
     *
     * @param {Array} folders - folders processing for base case.
     * @param {String} jobName - the name of the processing activeJob.
     * @param {String} folderId - the parent folder to assess.
     * @param {Object} client - the Box API client.
     * @param {Function} done - callback when complete.
     * @param {Function} update - the UI update callback.
     */
    static async addFoldersToJob(folders, jobName, folderId, client, done, update) {
        update({
            type: 'info',
            message: `Processing folder ${folderId}`
        });
        let exhausted= false;
        let offset = 0;
        let limit = 1000;
        let entries = [];

        while (!exhausted) {
            const ret = await client.folders.getItems(folderId, { fields: 'parent,name,path_collection', offset: offset, limit: limit });
            if (ret.total_count < limit) {
                exhausted = true;
            } else {
                offset += limit;
            }
            entries = entries.concat(ret.entries);
        }

        entries.forEach((e) => {
            if (e.type === 'folder') {
                const ji = {
                    jobName: jobName,
                    folderId: e.id,
                    folderName: e.name,
                    status: Constants.NEW,
                    data: e,
                    result: {},
                    jobId: config.get(Constants.ACTIVE_JOB)
                };
                JobItem.insertJobItem(ji);
                folders.push(e.id);
                JobBuilder.addFoldersToJob(folders, jobName, e.id, client, done, update);
            }
        });
        const idx = folders.indexOf(folderId);
        folders.splice(idx, 1);
        if (folders.length === 0) {
            done();
        }
    }

    /**
     * Recursively traverse a folder system and add enqueue all
     * files as new JobItems.
     *
     * TODO: need to test at scale - purely async may fail by exceeding stack, may need recursion to be synchronous.
     *
     * @param {Array} folders - folders processing for base case.
     * @param {String} jobName - the name of the processing activeJob.
     * @param {String} folderId - the parent folder to assess.
     * @param {Object} client - the Box API client.
     * @param {Function} done - callback when complete.
     * @param {Function} update - the UI update callback.
     */
    static async addFolderItemsToJob(folders, jobName, folderId, client, done, update) {
        update({
            type: 'info',
            message: `Processing folder ${folderId}`
        });
        let exhausted= false;
        let offset = 0;
        let limit = 1000;
        let entries = [];

        while (!exhausted) {
            const ret = await client.folders.getItems(folderId, { fields: 'parent,name,path_collection', offset: offset, limit: limit });
            if (ret.total_count < limit) {
                exhausted = true;
            } else {
                offset += limit;
            }
            entries = entries.concat(ret.entries);
        }

        entries.forEach((e) => {
            if (e.type === 'file') {
                const ji = {
                    jobName: jobName,
                    fileId: e.id,
                    fileName: e.name,
                    status: Constants.NEW,
                    data: e,
                    result: {},
                    jobId: config.get(Constants.ACTIVE_JOB)
                };
                JobItem.insertJobItem(ji);
            } else {
                folders.push(e.id);
                JobBuilder.addFolderItemsToJob(folders, jobName, e.id, client, done, update);
            }
        });
        const idx = folders.indexOf(folderId);
        folders.splice(idx, 1);
        if (folders.length === 0) {
            done();
        }
    }

    /**
     * Deletes the metadata template from Box.
     *
     * @param client - the Box API client.
     * @param jobItems - the JobItems list.
     * @param done - the complete callback.
     * @param update - the update UI callback.
     *
     * TODO: Should query datastore directly for Constants.SUCCESS
     */
    static async revertJob(client, jobItems, done, update) {
        const activeJob = await Job.getActiveJob();
        const templateKey = activeJob.metadataTemplate.templateKey;
        let reverted = 0;
        let errors = 0;
        await jobItems.forEach(async (ji, i) => {
            try {
                await client.files.deleteMetadata(ji.fileId, client.metadata.scopes.ENTERPRISE, templateKey);
                ji.status = Constants.REVERTED;
                ji.message = 'reverted';
                ji.result = 'reverted';
                reverted += 1;
                update({
                    type: 'info',
                    success: reverted,
                    errors: errors,
                    items: jobItems.length,
                    completed: i,
                    message: `Successfully reverted ${ji.name}`
                });
            } catch(e) {
                errors += 1;
                ji.status = Constants.ERROR;
                ji.message = e.message;
                ji.result = e;
                update({
                    type: 'error',
                    success: reverted,
                    errors: errors,
                    items: jobItems.length,
                    completed: i,
                    message: `Error reverting ${ji.name}`
                });
            } finally {
                JobItem.updateJobItem(ji);
            }

            if (i === (jobItems.length -1)) {
                done({errors: errors, reverted: reverted});
            }
        });
    }

    static async runFoldersJob(client, jobItems, done, update) {
       let errors = 0;
       let success = 0;
       let skipped = 0;
       const activeJob = await Job.getActiveJob();
       const jatts = JSON.parse(activeJob.mapAttributes);
       await jobItems.forEach(async (ji, i) => {
           try {
               const resp = await client.folders.update(ji.folderId, JSON.parse(activeJob.mapAttributes));
               ji.status = Constants.SUCCESS;
               ji.message = 'success';
               ji.result = resp;
               success += 1;
               update({
                   type: 'info',
                   success: success,
                   skipped: skipped,
                   errors: errors,
                   items: jobItems.length,
                   completed: i,
                   message: `Successfully updated folder to ${ji.folderName}`
               });
           } catch (e) {
               ji.status = Constants.ERROR;
               ji.message = e.message;
               ji.result = e;
               errors += 1;
               update({
                   type: 'error',
                   success: success,
                   skipped: skipped,
                   errors: errors,
                   items: jobItems.length,
                   completed: i,
                   message: `Error updating folder to ${ji.name}`
               });
           } finally {
               await JobItem.updateJobItem(ji);
           }
           if (i === (jobItems.length - 1)) {
               done({success: success, errors: errors, skipped: skipped });
           }
       });
    }

    /**
     * Applies the metadata to files in Box via API.
     *
     * @param client - the Box API client.
     * @param jobItems - the JobItems list.
     * @param done - the finished callback.
     * @param update - UI update callback.
     */
    static async runJob(client, jobItems, done, update) {
        let errors = 0;
        let success = 0;
        let skipped = 0;
        const activeJob = await Job.getActiveJob();
        const templateKey = activeJob.metadataTemplate.templateKey;
        const templateMap = activeJob.metadataMap;
        await jobItems.forEach(async (ji, i) => {
            const metadataValues = {};
            await ji.data.path_collection.entries.forEach(async (e) => {
                if (_.keys(templateMap).indexOf(e.name) !== -1) {
                    const match = templateMap[e.name];
                    metadataValues[match['attribute']] = e.name;
                }
            });
            try {
                if (_.isEmpty(metadataValues)) {
                    ji.status = Constants.SKIPPED;
                    ji.message = 'no metadata to apply';
                    ji.result = 'skipped';
                    skipped += 1;
                    update({
                        type: 'info',
                        success: success,
                        skipped: skipped,
                        errors: errors,
                        items: jobItems.length,
                        completed: i,
                        message: `Skipping: no metadata for ${ji.name}`
                    });
                }
                const md = await client.files.addMetadata(ji.fileId, client.metadata.scopes.ENTERPRISE, templateKey, metadataValues);
                ji.status = Constants.SUCCESS;
                ji.message = 'success';
                ji.result = md;
                success += 1;
                update({
                    type: 'info',
                    success: success,
                    skipped: skipped,
                    errors: errors,
                    items: jobItems.length,
                    completed: i,
                    message: `Successfully applied metadata to ${ji.name}`
                });
            } catch(e) {
                ji.status = Constants.ERROR;
                ji.message = e.message;
                ji.result = e;
                errors += 1;
                update({
                    type: 'error',
                    success: success,
                    skipped: skipped,
                    errors: errors,
                    items: jobItems.length,
                    completed: i,
                    message: `Error applying metadata to ${ji.name}`
                });
            } finally {
                JobItem.updateJobItem(ji);
            }
            if (i === (jobItems.length - 1)) {
                done({success: success, errors: errors, skipped: skipped });
            }
        });
    }

    /**
     * Simulates the mapping of metadata from file paths
     * to the metadata template - not currently used.
     */
    static async simulateJob(templateMap) {
        const jobItems = await JobItem.getJobItems();
        const misses = {};
        const keys = _.keys(templateMap);
        await jobItems.forEach(async (ji) => {
            await ji.data.path_collection.entries.forEach(async (e) => {
                if (keys.indexOf(e.name) == -1) {
                    if (_.keys(misses).indexOf(e.name) == -1) {
                        misses[e.name] = { count: 1 };
                    } else {
                        misses[e.name]['count'] = misses[e.name]['count'] + 1;
                    }
                } else {
                    templateMap[e.name]['count'] = templateMap[e.name]['count'] + 1;
                }
            });
        });
        return { hits: templateMap, misses: misses };
    }
}

export default JobBuilder;
