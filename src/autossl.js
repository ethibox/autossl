import '@babel/polyfill';
import 'dotenv/config';
import isFQDN from 'validator/lib/isFQDN';
import { sleep } from 'sleep';
import fetch from 'node-fetch';

const getLoadBalancers = async (region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());

    return data;
};

const getCertificates = async (lb, region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/certificates`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());

    return data;
};

const addCertificate = async (lb, rootDomain, domains, region = 'fr-par') => {
    const body = { name: 'cert01', letsencrypt: { common_name: rootDomain } };

    if (domains) {
        body.letsencrypt.subject_alternative_name = domains;
        domains.forEach((domain) => {
            if (!isFQDN(domain)) {
                throw new Error(`Domain ${domain} is invalid`);
            }
        });
    }

    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/certificates/`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());

    if (data.message) {
        throw new Error('Certificate error');
    }

    return data;
};

const getFrontends = async (lb, region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/frontends`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());

    return data;
};

const updateFrontend = async (frontendId, backendId, certificateId, region = 'fr-par') => {
    const body = {
        name: 'https-443',
        inbound_port: '443',
        backend_id: backendId,
        certificate_id: certificateId,
    };

    await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/frontends/${frontendId}`, {
        body: JSON.stringify(body),
        method: 'PUT',
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());
};

const removeCertificate = async (certificate, region = 'fr-par') => {
    await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/certificates/${certificate}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': process.env.TOKEN },
    });
};

const waitCertificate = async (certificateId, retries = 0, restart, region = 'fr-par') => {
    const certificate = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/certificates/${certificateId}`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    })
        .then((res) => res.json());

    const { status } = certificate;

    if (retries >= 3) {
        throw new Error('Max retries exceeded');
    }

    if (status === 'error') {
        console.log('Restart...');
        await removeCertificate(certificateId);
        await restart();
    }

    if (status !== 'ready') {
        console.log('Wait certificate...');
        sleep(30);
        return waitCertificate(certificateId, retries + 1, restart);
    }

    return true;
};

const start = async (rootDomain, domain, retries = 0) => {
    if (retries >= 3) {
        throw new Error(`Max retries exceeded for domain ${domain}`);
    }

    // Get Load balancers

    const { lbs: loadBalancers } = await getLoadBalancers();
    const loadBalancerId = loadBalancers[0].id;

    if (!loadBalancers.length) {
        throw new Error('No load balancers');
    }

    // Get certificates

    let { certificates } = await getCertificates(loadBalancerId);

    if (!certificates.length) {
        await addCertificate(loadBalancerId, rootDomain);
        ({ certificates } = await getCertificates(loadBalancerId));
    }

    const certificateId = certificates[0].id;
    const domains = certificates[0].subject_alternative_name;
    domains.push(domain);
    const newDomains = [...new Set(domains)];

    // Add new certificate

    const newCertificate = await addCertificate(loadBalancerId, rootDomain, newDomains);
    const newCertificateId = newCertificate.id;

    // Wait certificate

    await waitCertificate(newCertificateId, 0, async () => {
        await start(rootDomain, domain, retries + 1);
    });

    // Get frontend list

    const { frontends } = await getFrontends(loadBalancerId);

    if (!frontends.length) {
        throw new Error('No frontends');
    }

    const frontendHTTPS = frontends.filter(({ name }) => name === 'https-443');
    const frontendHTTPSId = frontendHTTPS[0].id;
    const backendHTTPSId = frontendHTTPS[0].backend.id;

    // Update frontend

    await updateFrontend(frontendHTTPSId, backendHTTPSId, newCertificateId);

    // Remove old certificate

    await removeCertificate(certificateId);

    console.log(`Domain ${domain} successfully added`);
};

export default start;
