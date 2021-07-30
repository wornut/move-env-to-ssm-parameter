import { log } from './helper/logger';
import { getEnvFromBitbucketPipelineVariable } from './get_env_from_bitbucket_pipeline';

(async () => {
    log([JSON.stringify(argv)]);
    await getEnvFromBitbucketPipelineVariable();
})().catch((p) => {
    log(p, console.error);
    process.exit(1);
});
